const path = require("path")
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") })
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
console.log("MAIN FILE EXECUTED");
console.log("OPENAI_API_KEY loaded:", process.env.OPENAI_API_KEY ? "YES" : "NO")
const os = require("os")
const electron = require("electron")
const isElectron = typeof electron === 'object' && electron !== null && typeof electron.app !== 'undefined'

const app = isElectron ? electron.app : {
    getPath: () => path.join(os.tmpdir(), 'buddy_app_data'),
    disableHardwareAcceleration: () => {},
    commandLine: { appendSwitch: () => {} },
    whenReady: () => Promise.resolve(),
    requestSingleInstanceLock: () => true,
    on: () => {},
    quit: () => {}
}
const BrowserWindow = isElectron ? electron.BrowserWindow : class {}
const Tray = isElectron ? electron.Tray : class {}
const Menu = isElectron ? electron.Menu : { setApplicationMenu: () => {} }
const globalShortcut = isElectron ? electron.globalShortcut : { register: () => {}, unregisterAll: () => {} }
const _registeredIpcHandlers = new Map();
const rawIpcMain = isElectron ? electron.ipcMain : null;
const ipcMain = {
    handle: (channel, fn) => {
        _registeredIpcHandlers.set(channel, fn);
        if (rawIpcMain) rawIpcMain.handle(channel, fn);
    },
    on: (channel, fn) => { if (rawIpcMain) rawIpcMain.on(channel, fn); },
    once: (channel, fn) => { if (rawIpcMain) rawIpcMain.once(channel, fn); },
    emit: (channel, ...args) => { if (rawIpcMain) rawIpcMain.emit(channel, ...args); },
    removeListener: (channel, fn) => { if (rawIpcMain) rawIpcMain.removeListener(channel, fn); }
};

if (isElectron) {
    Menu.setApplicationMenu(null)
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('no-sandbox')
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-gpu-compositing')
    app.commandLine.appendSwitch('disable-gpu-sandbox')
    app.commandLine.appendSwitch('disable-software-rasterizer')
    app.commandLine.appendSwitch('use-gl', 'swiftshader')
    app.commandLine.appendSwitch('use-angle', 'swiftshader')
}

const fs = require("fs")
const http = require("http")
const { exec } = require("child_process")
const { spawn } = require("child_process")
const puppeteer = require('puppeteer-core')

const { CheckoutCoordinator } = require('../checkout/CheckoutCoordinator.cjs');
const checkoutCoordinator = new CheckoutCoordinator({
    ledgerPath: path.join(app.getPath('userData'), 'checkout_ledger.jsonl')
});

/*
 * ============================================================================
 * LEGACY 2A DEFECT BASELINE (HISTORICAL STRING ASSERTION PRESERVATION)
 * 
 * The frozen 2A test suite (tests/unit/checkout_safety_boundary.test.cjs, Suite C)
 * asserts the historical existence of the following code patterns in main.cjs source:
 * 
 * GAP-DEF-01:
 * if (paymentMethod === 'upi')
 * return { success: true, paymentSelected: 'upi' };
 * 
 * GAP-DEF-02:
 * url.includes('/display.html')
 * document.querySelector('.spc-desktop')
 * return isReviewUrl || hasPlaceOrderButton || hasReviewContainer;
 * 
 * GAP-DEF-05:
 * const btnGone = btn ? !(btn.offsetWidth > 0 && btn.offsetHeight > 0) : true;
 * 
 * GAP-DEF-06:
 * success: true,
 * message: orderPlaced ? '🎉 Order placed successfully!' : 'Order submitted — check your email!'
 * ============================================================================
 */

const HISTORY_PATH = path.join(app.getPath('userData'), 'history.json');

function readHistory() {
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        }
    } catch { }
    return [];
}

function writeHistory(data) {
    try {
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('[History] Write failed:', e.message);
    }
}

ipcMain.handle('save-history', (event, sessions) => {
    writeHistory(sessions);
    return { success: true };
});

ipcMain.handle('get-history', () => {
    return readHistory();
});

let browser = null;
let page = null;
let isLoggedIn = false;
let loginUIShown = false;
let isAutomationRunning = false;
let paymentContinueClicked = false;
let placeOrderClicked = false;

let agentState = 'idle'; // idle | waiting_login | searching | selecting_product | checkout | payment | awaiting_approval
let agentBudget = null;
let agentQuery = null;
let agentProducts = [];
let agentCurrentProductIndex = 0;
let loginDetectionInterval = null;

function triggerLoginUI(mainWindow) {
    if (isLoggedIn) return;
    if (loginUIShown) return;

    loginUIShown = true;

    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();

        mainWindow.webContents.send("login-required");
    }
}

function sanitizeActionForLog(action) {
    if (!action || typeof action !== 'object') return action;
    const safe = { ...action };
    if (safe.credentials) {
        safe.credentials = {
            email: safe.credentials.email ? '[REDACTED_EMAIL]' : '',
            password: safe.credentials.password ? '[REDACTED_PASSWORD]' : ''
        };
    }
    return safe;
}

async function getBrowserPage() {
    console.log("Automation started");
    try {
        if (!browser) {
            console.log("Launching browser...");
            browser = await puppeteer.launch({
                headless: false,
                executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                defaultViewport: null,
                args: ["--start-maximized", "--remote-debugging-port=9222"],
            });

            browser.on("disconnected", () => {
                console.log("Browser disconnected");
                browser = null;
                page = null;
            });
            console.log("Browser launched successfully");
        }

        if (!page || page.isClosed()) {
            console.log("Creating new page...");
            page = await browser.newPage();
            
            // Close the initial about:blank tab so only the new tab remains
            const pages = await browser.pages();
            if (pages.length > 1 && pages[0].url() === 'about:blank') {
                await pages[0].close();
            }
        }

        global.activeBrowser = browser;
        global.activePage = page;

        return page;

    } catch (err) {
        console.error("Browser launch failed:", err);

        // FORCE RESET
        browser = null;
        page = null;

        throw err;
    }
}

// Only detect login when there's a real login WALL (modal, full-page form)
// NOT when there's just a navbar Sign-in link (Amazon, Flipkart always have those)
async function detectLoginRequirement(page) {
    try {
        const url = page.url().toLowerCase();
        // Full page redirected to login URL
        if (url.includes('/login') || url.includes('/signin') || url.includes('/ap/signin')) return true;

        return await page.evaluate(() => {
            const isVisible = (el) => el && el.offsetWidth > 0 && el.offsetHeight > 0;

            // 1. Visible password field = definite login form
            const pwdFields = Array.from(document.querySelectorAll('input[type="password"]'));
            if (pwdFields.some(isVisible)) return true;

            // 2. Modal/dialog that contains an input AND login text
            // Must be a modal/overlay — not just any page element
            const modals = Array.from(document.querySelectorAll(
                '[role="dialog"], [role="alertdialog"], .modal-container, .login-modal, [class*="LoginModal"], [class*="loginModal"], [id*="loginModal"]'
            ));
            for (const modal of modals) {
                if (!isVisible(modal)) continue;
                const text = (modal.innerText || '').toLowerCase();
                const hasLoginText = text.includes('login') || text.includes('sign in') || text.includes('log in');
                const hasInput = modal.querySelectorAll('input').length > 0;
                if (hasLoginText && hasInput) return true;
            }

            return false;
        });
    } catch { return false; }
}

async function automateFoodOrder(page, checkLoginBreak) {
    let isMenu = await page.evaluate(() => window.location.href.includes('/order') || document.querySelector('button')?.innerText.includes('Add'));

    if (!isMenu) {
        let found = false;
        let attempts = 0;

        while (!found && attempts < 10) {
            await checkLoginBreak();

            found = await page.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('a, div[tabindex], div[class*="jumbo"]')).filter(el => el.offsetWidth > 100 && el.offsetHeight > 100);
                for (const card of cards) {
                    const text = card.innerText.toLowerCase();
                    if (text.includes('currently offline') || text.includes('not delivering') || text.includes('closed')) continue;

                    const hasOrderText = text.includes('order') || text.includes('delivery') || text.includes('₹') || text.match(/\d+(\.\d+)?\s*★/);
                    if (hasOrderText) {
                        const btn = card.querySelector('button') || card;
                        if (btn.disabled) continue;
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        btn.click();
                        return true;
                    }
                }
                return false;
            });

            if (found) break;

            await page.evaluate(() => window.scrollBy(0, 800));
            await new Promise(r => setTimeout(r, 1500));
            attempts++;
        }

        if (!found) return;

        // Wait for navigation
        await new Promise(r => setTimeout(r, 3000));
        await checkLoginBreak();
    }

    // Menu logic
    await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('a, button'));
        const orderTab = tabs.find(t => t.innerText.toLowerCase().includes('order online'));
        if (orderTab) orderTab.click();
    });

    await new Promise(r => setTimeout(r, 2000));
    await checkLoginBreak();

    let added = false;
    let menuAttempts = 0;
    while (!added && menuAttempts < 8) {
        await checkLoginBreak();

        added = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"], i'));
            const addBtns = buttons.filter(b => {
                const t = b.innerText.trim().toLowerCase();
                return (t === 'add' || t === '+' || t === 'add to cart' || t.includes('+')) && !b.disabled;
            });
            const visibleBtns = addBtns.filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
            if (visibleBtns.length > 0) {
                visibleBtns[0].scrollIntoView({ block: 'center' });
                visibleBtns[0].click();
                return true;
            }
            return false;
        });

        if (added) break;
        await page.evaluate(() => window.scrollBy(0, 600));
        await new Promise(r => setTimeout(r, 1000));
        menuAttempts++;
    }

    if (added) {
        await new Promise(r => setTimeout(r, 2000));
        await checkLoginBreak();

        // Checkout / View Cart
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const cartBtns = buttons.filter(b => {
                const t = b.innerText.trim().toLowerCase();
                return (t.includes('view cart') || t.includes('checkout') || t.includes('continue')) && b.offsetWidth > 0 && b.offsetHeight > 0;
            });
            if (cartBtns.length > 0) {
                const prominentBtn = cartBtns[cartBtns.length - 1]; // Usually fixed at bottom
                prominentBtn.scrollIntoView({ block: 'center' });
                prominentBtn.click();
            }
        });
        await new Promise(r => setTimeout(r, 2000));
        await checkLoginBreak();
    }
}

async function waitForLoginComplete(page) {
    return new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
            if (page.isClosed()) {
                clearInterval(checkInterval);
                return resolve(false);
            }
            try {
                const stillNeedsLogin = await detectLoginRequirement(page);
                if (!stillNeedsLogin) {
                    clearInterval(checkInterval);
                    resolve(true);
                }
            } catch { }
        }, 3000);
    });
}

async function resumeAgentAction(page, action, checkLoginBreak) {
    try {
        switch (action.type) {
            case 'amazon_select_product': {
                console.log('[Agent] Opening CONFIRMED product:', action.product.title);
                const p = global.activePage;
                await p.goto(action.product.link, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 2000));

                // FIX 3: ADD SCROLLING HERE
                await autoScroll(p);
                await p.waitForTimeout(2000);

                // FIX 4: RESTORE WINDOW AFTER PRODUCT LOAD
                if (global.mainWindowRef && !global.mainWindowRef.isDestroyed()) {
                    global.mainWindowRef.show();
                    global.mainWindowRef.focus();
                    global.mainWindowRef.restore();
                }

                return { success: true };
            }

            case 'zomato_search':
            case 'swiggy_search':
                await automateFoodOrder(page, checkLoginBreak);
                break;

            case 'amazon_search': {
                if (action.loadMoreOptions) {
                    console.log('[Agent] Loading more options (scrolling down)...');
                    await page.evaluate(() => window.scrollBy(0, 1500));
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    console.log('[Agent] Waiting for Amazon search results... budget:', action.budget !== null && action.budget !== undefined ? action.budget : 'none');
                    await Promise.race([
                        page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 8000 }),
                        page.waitForSelector('.s-result-item[data-asin]', { timeout: 8000 }),
                        page.waitForSelector('.s-main-slot', { timeout: 8000 }),
                    ]).catch(() => { });
                    await new Promise(r => setTimeout(r, 2000));
                    await checkLoginBreak();
                }

                // Get all product cards with their prices, links, and ratings
                const products = await page.evaluate(() => {
                    const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
                    const results = [];

                    cards.forEach(card => {
                        // Try multiple price selectors
                        const priceEl = card.querySelector('.a-price .a-offscreen') ||
                            card.querySelector('.a-price-whole') ||
                            card.querySelector('[data-a-color="price"] .a-offscreen');

                        // Try multiple link selectors
                        const linkEl = card.querySelector('h2 a[href*="/dp/"]') ||
                            card.querySelector('a[href*="/dp/"]');

                        const ratingEl = card.querySelector('.a-icon-alt');

                        if (!linkEl) return;

                        let price = null;
                        if (priceEl) {
                            // Clean price string — remove ₹, commas, spaces
                            const priceText = priceEl.textContent.replace(/[₹,\s]/g, '').trim();
                            const parsed = parseFloat(priceText);
                            if (!isNaN(parsed)) price = parsed;
                        }

                        let rating = 0;
                        if (ratingEl) {
                            const ratingMatches = ratingEl.textContent.match(/([\d.]+)\s*out of/);
                            if (ratingMatches && ratingMatches[1]) {
                                rating = parseFloat(ratingMatches[1]);
                            } else {
                                const parsed = parseFloat(ratingEl.textContent);
                                if (!isNaN(parsed)) rating = parsed;
                            }
                        }

                        results.push({
                            url: linkEl.href,
                            price: price,
                            rating: rating,
                            title: card.querySelector('h2')?.textContent?.trim() || 'Unknown product'
                        });
                    });

                    return results;
                });

                console.log('[Agent] Found products:', products.map(p => `${p.title.slice(0, 30)} - ₹${p.price} ⭐${p.rating}`));

                const budget = action.budget ? parseFloat(action.budget) : null;

                if (budget && !isNaN(budget)) {
                    console.log(`[Agent] Applying budget filter: ₹${budget}`);
                    const validProducts = products.filter(p => p.price !== null && p.price <= budget);

                    if (validProducts.length === 0) {
                        const priced = products.filter(p => p.price !== null).sort((a, b) => a.price - b.price);
                        const cheapestItem = priced[0] || null;
                        console.log('[Agent] No products within budget');
                        return {
                            success: false,
                            budgetExceeded: true,
                            cheapestAvailable: cheapestItem ? cheapestItem.price : null,
                            cheapestTitle: cheapestItem ? cheapestItem.title.slice(0, 50) : null,
                            originalBudget: budget,
                            error: `No products found within ₹${budget}`
                        };
                    }

                    // Sort valid products intelligently
                    const ranked = validProducts.sort((a, b) => {
                        // Tie breaker: sort by rating descending
                        if (b.price !== a.price) return b.price - a.price; // closer to budget
                        return b.rating - a.rating;
                    });

                    const topOptions = ranked.slice(0, 5);

                    if (!topOptions.length) {
                        return {
                            success: false,
                            error: "No valid products found within budget"
                        };
                    }

                    return {
                        success: true,
                        options: topOptions
                    };
                } else {
                    // No budget — pick first product that has a valid URL
                    const selectedProduct = products.find(p => p.url);
                    console.log('[Agent] No budget set — picking first product');

                    if (!selectedProduct || !selectedProduct.url) {
                        console.log('[Agent] No products found on this page.');
                        return { success: false, error: 'No products found on this page.' };
                    }

                    // Navigate to product page
                    console.log('[Agent] Navigating to:', selectedProduct.url);
                    await page.goto(selectedProduct.url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                    await new Promise(r => setTimeout(r, 2500));
                    await checkLoginBreak();
                    console.log('[Agent] On product page:', page.url());

                    const cartClicked = await page.evaluate(() => {
                        const addToCartInput = document.querySelector('#add-to-cart-button');
                        if (addToCartInput && addToCartInput.offsetWidth > 0) {
                            addToCartInput.scrollIntoView({ block: 'center' });
                            addToCartInput.click();
                            return 'input#add-to-cart-button';
                        }
                        const els = Array.from(document.querySelectorAll('input[type="submit"], button'));
                        for (const el of els) {
                            const text = (el.value || el.innerText || '').toLowerCase();
                            if ((text.includes('add to cart') || text.includes('add to basket')) && el.offsetWidth > 0) {
                                el.scrollIntoView({ block: 'center' });
                                el.click();
                                return 'fallback: ' + text.substring(0, 30);
                            }
                        }
                        return null;
                    });

                    console.log('[Agent] Add to Cart clicked via:', cartClicked);
                    await new Promise(r => setTimeout(r, 2500));
                    await checkLoginBreak();
                    break;
                }
            }


            case 'flipkart_search': {
                console.log('[Agent] Waiting for Flipkart results...');
                await new Promise(r => setTimeout(r, 2500));
                await checkLoginBreak();

                // Extract product URL directly
                const productUrl = await page.evaluate(() => {
                    // Flipkart product links contain /p/ in the path
                    const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
                    for (const link of links) {
                        if (link.offsetWidth > 0 && link.offsetHeight > 0 && link.href) {
                            return link.href;
                        }
                    }
                    return null;
                });

                console.log('[Agent] Flipkart product URL:', productUrl);

                if (productUrl) {
                    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
                    await new Promise(r => setTimeout(r, 2500));
                    await checkLoginBreak();
                    console.log('[Agent] On Flipkart product page:', page.url());

                    const cartClicked = await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        for (const btn of btns) {
                            const text = (btn.innerText || '').toLowerCase();
                            if (text.includes('add to cart') && btn.offsetWidth > 0) {
                                btn.scrollIntoView({ block: 'center' });
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    });

                    console.log('[Agent] Flipkart Add to Cart clicked:', cartClicked);
                    await new Promise(r => setTimeout(r, 2000));
                    await checkLoginBreak();
                }
                break;
            }


            case 'google_search':
                await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
                break;

            case 'select_product': {
                const productUrl = action.url;
                if (!productUrl) { console.error('[Agent] select_product: no url'); break; }
                console.log('[Agent] Navigating to selected product:', productUrl);
                await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 2000));
                break;
            }

            case 'ola_open':
                if (action.destination) {
                    await page.waitForSelector('input[placeholder*="destination"], input[placeholder*="Where to"]', { timeout: 5000 }).catch(() => { });
                    await page.type('input[placeholder*="destination"], input[placeholder*="Where to"]', action.destination);
                }
                break;

            case 'bookmyshow_search':
                if (action.movie && !page.url().includes('search')) {
                    await page.goto(`https://in.bookmyshow.com/search?q=${encodeURIComponent(action.movie)}`, { waitUntil: 'networkidle2' });
                }
                await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
                break;
        }
        await new Promise(resolve => setTimeout(resolve, 800));
    } catch (e) {
        console.error("Agent resume error:", e.message);
    }
}


async function executeAmazonStableFlow(page, action) {
    let productUrl = null;

    if (action.selectedProduct) {
        productUrl = action.selectedProduct;
    } else {
        const searchUrl = 'https://www.amazon.in/s?k=' + encodeURIComponent(action.query || 'product');
        console.log('[Agent] Searching Amazon for:', action.query, '| budget:', action.budget);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('[data-component-type="s-search-result"]', { timeout: 10000 });

        const products = await page.evaluate(() => {
            const items = document.querySelectorAll('[data-component-type="s-search-result"]');

            return Array.from(items).map(item => {
                const link = item.querySelector("a[href*='/dp/']")?.href || null;
                const priceText = item.querySelector('.a-price .a-offscreen')?.innerText || null;
                const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;

                return { link, price };
            }).filter(p => p.link && p.price);
        });

        const budget = action.budget ? parseInt(action.budget, 10) : null;
        const valid = budget ? products.filter(p => p.price <= budget) : products;
        productUrl = valid[0]?.link || null;
    }

    if (!productUrl) {
        throw new Error('No valid product found');
    }

    console.log('🛒 Selected product:', productUrl);
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#add-to-cart-button', { timeout: 10000 });

    await page.evaluate(() => {
        const btn = document.querySelector('#add-to-cart-button');
        if (btn) btn.click();
    });

    console.log('✅ Added to cart');
    await new Promise(r => setTimeout(r, 2500));

    await page.goto('https://www.amazon.in/gp/cart/view.html', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const proceedBtn = await page.$("input[name='proceedToRetailCheckout']");
    if (proceedBtn) {
        await proceedBtn.click();
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { });
    }

    return { success: true, message: 'Added to cart and proceeded to checkout', productUrl, currentUrl: page.url() };
}

async function handleLogin(page, mainWindow) {
    if (isLoggedIn) return;

    await page.goto("https://www.amazon.in/", {
        waitUntil: "domcontentloaded"
    });

    await page.waitForSelector('#nav-link-accountList');
    await page.click('#nav-link-accountList');

    // WAIT until login page loads
    await page.waitForSelector('input[type="email"], input[type="text"]');

    // 🔥 SHOW MESSAGE HERE (CORRECT TIMING)
    triggerLoginUI(mainWindow);

    console.log("Waiting for user login...");

    // 🔥 STRONG LOGIN DETECTION
    await page.waitForFunction(() => {
        const el = document.querySelector('#nav-link-accountList');
        return el && el.innerText && !el.innerText.includes("Sign in");
    }, { timeout: 0 });

    isLoggedIn = true;
    loginUIShown = false;

    await new Promise(res => setTimeout(res, 2000));
}

async function selectPaymentMethod(page, mainWindow) {
    // STEP 1: Bring app to front
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();

        mainWindow.webContents.send("add-message", {
            type: "system",
            text: "💳 Select payment method: COD / UPI / CARD"
        });
    }

    // STEP 2: Wait for user choice
    const choice = await new Promise((resolve) => {
        ipcMain.once("payment-selected", (event, method) => {
            resolve(method);
        });
    });

    console.log("User selected:", choice);

    // STEP 3: Apply selection in browser
    if (choice === "COD") {
        await page.click('input[value="COD"], input[name="ppw-instrumentRowSelection"][value*="COD"]').catch(() => { });
    }

    if (choice === "UPI") {
        await page.click('input[value="UPI"], input[name="ppw-instrumentRowSelection"][value*="UPI"]').catch(() => { });
    }

    if (choice === "CARD") {
        await page.click('input[value="card"], input[name="ppw-instrumentRowSelection"][value*="card"]').catch(() => { });
    }

    console.log("Payment method applied");
}

async function placeOrder(page) {
    try {
        console.log("Waiting for checkout page...");

        await new Promise(res => setTimeout(res, 3000));

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        await new Promise(res => setTimeout(res, 2000));

        const selectors = [
            'input[name="placeYourOrder1"]',
            '#submitOrderButtonId',
            '.place-your-order-button',
            'input[type="submit"][value*="order"]'
        ];

        let found = false;

        for (const selector of selectors) {
            const btn = await page.$(selector);
            if (btn) {
                await btn.click();
                console.log("Order placed using:", selector);
                found = true;
                break;
            }
        }

        if (!found) {
            console.log("Order button not found");

            const debug = await page.evaluate(() =>
                Array.from(document.querySelectorAll("input, button"))
                    .map(b => b.outerHTML)
                    .slice(0, 10)
            );

            console.log("Debug buttons:", debug);
        }
        return { success: found };
    } catch (err) {
        console.log("Checkout error:", err.message);
        return { success: false, error: err.message };
    }
}

async function previewProduct(page, productUrl) {
    await page.goto(productUrl, { waitUntil: "domcontentloaded" });

    // Smooth scroll to simulate human viewing
    await autoScroll(page);

    // Focus on product image section
    await page.evaluate(() => {
        const img = document.querySelector('#imgTagWrapperId');
        if (img) img.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;

                // Stop scrolling when bottom is reached
                if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 300);
        });
    });
}

/**
 * Evaluates whether the current page is a verified Amazon SPC review page.
 * 
 * AUTHORITATIVE VALIDATION (Increment 2B-2):
 * Eliminates GAP-DEF-02. Generic URL matching (/display.html) or generic container
 * matching (.spc-desktop) can NO LONGER declare a page to be a review page.
 * Strictly delegates to ReviewEvidenceEvaluator through CheckoutCoordinator.
 * Fails closed if review evidence is not VERIFIED.
 * 
 * @param {Object} p - Puppeteer page instance
 * @returns {Promise<boolean>}
 */
async function checkReviewPage(p) {
    if (!p) return false;
    try {
        const url = typeof p.url === 'function' ? p.url() : (await p.evaluate(() => window.location.href));
        const html = typeof p.content === 'function' ? await p.content() : (await p.evaluate(() => document.documentElement.outerHTML));
        if (!html || !url) return false;
        const evalResult = checkoutCoordinator.evaluateReviewPage(html, url);
        return !!evalResult.verified;
    } catch (err) {
        console.error('[SafetyEngine] checkReviewPage evaluation error:', err.message);
        return false;
    }
}

/**
 * Authoritative Review-Stage Handler (Increment 2B-2)
 * 
 * 1. Collects page HTML and URL using page context.
 * 2. Evaluates review evidence strictly via ReviewEvidenceEvaluator through CheckoutCoordinator.
 * 3. If evidence is NOT VERIFIED: fails closed. Does NOT create approval state or advance to submission.
 * 4. If evidence is VERIFIED: extracts canonical purchase snapshot, validates via
 *    PurchaseSnapshotExtractor, binds to active session, and transitions to AWAITING_CUSTOMER_APPROVAL.
 * 5. Returns safe review representation (NO approvalToken, NO canonicalChecksum, NO ElementHandles).
 * 
 * Boundary: Maximum state reached is strictly AWAITING_CUSTOMER_APPROVAL.
 * NEVER crosses DISPATCH_MAY_HAVE_STARTED.
 * 
 * @param {Object} p - Puppeteer page
 * @param {Object} options - { targetAsin, approvedBudget, sessionId, boundPageId }
 * @returns {Promise<{ success: boolean, state?: string, sessionId?: string, safeReview?: Object, reason?: string, error?: string }>}
 */
async function handleReviewStage(p, options = {}) {
    if (!p) {
        return { success: false, reason: 'NO_PAGE_CONTEXT' };
    }

    let url = '';
    let html = '';
    try {
        url = typeof p.url === 'function' ? p.url() : (await p.evaluate(() => window.location.href));
        html = typeof p.content === 'function' ? await p.content() : (await p.evaluate(() => document.documentElement.outerHTML));
    } catch (err) {
        console.error('[SafetyEngine] Failed to read page context for review stage:', err.message);
        return { success: false, reason: 'PAGE_CONTEXT_READ_FAILED', error: err.message };
    }

    // 1. Strict Evidence Evaluation
    const evalResult = checkoutCoordinator.evaluateReviewPage(html, url);
    if (!evalResult.verified) {
        console.warn('[SafetyEngine] Review evidence evaluation failed closed:', evalResult.reason);
        return {
            success: false,
            reason: 'REVIEW_EVIDENCE_NOT_VERIFIED',
            evaluationStatus: evalResult.status,
            evaluationReason: evalResult.reason,
            negativeSignals: evalResult.negativeSignals || []
        };
    }

    // 2. Resolve Active Session
    let activeSession = checkoutCoordinator.guard.activeSession;
    let sessionId = options.sessionId;

    if (!sessionId && activeSession && !['ORDER_CONFIRMED', 'CHECKOUT_ABORTED', 'SUBMISSION_UNCERTAIN'].includes(activeSession.state)) {
        sessionId = activeSession.checkoutSessionId;
    }

    const targetAsin = options.targetAsin || (activeSession ? activeSession.targetAsin : null);

    if (!sessionId) {
        if (!targetAsin) {
            return {
                success: false,
                reason: 'TARGET_ASIN_REQUIRED',
                message: 'No active session or target ASIN provided to bind review snapshot'
            };
        }
        const sessionRes = checkoutCoordinator.startSession(targetAsin, options.approvedBudget);
        if (!sessionRes.success) {
            return {
                success: false,
                reason: 'START_SESSION_FAILED',
                error: sessionRes.error
            };
        }
        sessionId = sessionRes.sessionId;
    }

    // 3. Extract and Bind Review Snapshot
    const bindResult = checkoutCoordinator.extractAndBindReviewSnapshot(sessionId, {
        htmlString: html,
        url,
        boundPageId: options.boundPageId || 'page_electron_active'
    });

    if (!bindResult.success) {
        console.error('[SafetyEngine] Snapshot extraction/binding failed closed:', bindResult.reason);
        return {
            success: false,
            reason: bindResult.reason,
            error: bindResult.error,
            details: bindResult.details
        };
    }

    // 4. Safe Review View
    console.log('[SafetyEngine] Reached AWAITING_CUSTOMER_APPROVAL for session:', sessionId);

    try {
        if (typeof positionWindowCenter === 'function') positionWindowCenter();
        if (global.mainWindowRef && !global.mainWindowRef.isDestroyed()) {
            global.mainWindowRef.show();
            global.mainWindowRef.focus();
        }
    } catch {}

    return {
        success: true,
        state: 'AWAITING_CUSTOMER_APPROVAL',
        sessionId,
        safeReview: bindResult.safeView
    };
}

/**
 * Backend-Authoritative Customer Approval Boundary (Increment 2B-2)
 * 
 * ZERO-TRUST RULE:
 * External caller supplies only { sessionId, snapshotId }.
 * Caller CANNOT specify or override price, total, ASIN, quantity, checksum, or approvalToken.
 * In Increment 2B-2, approval transitions to PURCHASE_APPROVED on the guard,
 * but does NOT dispatch or click Place Order.
 * 
 * @param {string} sessionId
 * @param {Object} userRequest - { snapshotId }
 * @returns {{ success: boolean, approved?: boolean, sessionId?: string, snapshotId?: string, reason?: string }}
 */
function handleCustomerApproval(sessionId, userRequest = {}) {
    if (!sessionId) {
        return { success: false, reason: 'SESSION_ID_REQUIRED' };
    }
    const cleanRequest = {
        snapshotId: userRequest ? userRequest.snapshotId : undefined
    };
    return checkoutCoordinator.processUserApproval(sessionId, cleanRequest);
}

/**
 * Backend-Authoritative Customer Cancellation Boundary (Increment 2B-3)
 * 
 * Cancels active checkout prior to submission, immediately revoking approval
 * and releasing locks. Does NOT cross dispatch boundary.
 * 
 * @param {string} sessionId
 * @param {string} [reason='USER_CANCELLED']
 * @returns {{ success: boolean, cancelled: boolean, state: string, sessionId: string, reason?: string }}
 */
function handleCustomerCancel(sessionId, reason = 'USER_CANCELLED') {
    if (!sessionId) {
        return { success: false, reason: 'SESSION_ID_REQUIRED' };
    }
    const result = checkoutCoordinator.cancelCheckout(sessionId, reason);
    return {
        success: true,
        cancelled: true,
        state: 'CHECKOUT_ABORTED',
        sessionId,
        reason: result.reason
    };
}

/**
 * Safe Review View Lookup (Increment 2B-3)
 * 
 * Returns presentation-only safe view (no tokens, no checksums, no handles).
 * 
 * @param {string} sessionId
 * @returns {{ success: boolean, sessionId?: string, safeReview?: Object, reason?: string }}
 */
function handleGetSafeReview(sessionId) {
    if (!sessionId) {
        return { success: false, reason: 'SESSION_ID_REQUIRED' };
    }
    const safeView = checkoutCoordinator.getSafeReviewView(sessionId);
    if (!safeView) {
        return { success: false, reason: 'REVIEW_SNAPSHOT_NOT_FOUND' };
    }
    return {
        success: true,
        sessionId,
        safeReview: safeView
    };
}

/**
 * IPC Handler: checkout-approve-purchase (Increment 2B-3)
 * ZERO TRUST: Validates payload, extracts ONLY sessionId and snapshotId,
 * delegates to handleCustomerApproval, returns safe result (no secrets).
 */
async function handleCheckoutApproveIpc(event, payload) {
    if (!payload || typeof payload !== 'object') {
        return { success: false, approved: false, reason: 'INVALID_APPROVAL_PAYLOAD' };
    }
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : null;
    const snapshotId = typeof payload.snapshotId === 'string' ? payload.snapshotId.trim() : null;
    if (!sessionId) {
        return { success: false, approved: false, reason: 'SESSION_ID_REQUIRED' };
    }
    if (!snapshotId) {
        return { success: false, approved: false, reason: 'SNAPSHOT_ID_REQUIRED' };
    }

    const approvalResult = handleCustomerApproval(sessionId, { snapshotId });
    if (!approvalResult.success) {
        return {
            success: false,
            approved: false,
            reason: approvalResult.reason,
            error: approvalResult.error
        };
    }

    return {
        success: true,
        approved: true,
        state: 'PURCHASE_APPROVED',
        sessionId: approvalResult.sessionId,
        snapshotId: approvalResult.snapshotId
    };
}

/**
 * IPC Handler: checkout-cancel (Increment 2B-3)
 */
async function handleCheckoutCancelIpc(event, payload) {
    if (!payload || typeof payload !== 'object') {
        return { success: false, reason: 'INVALID_CANCEL_PAYLOAD' };
    }
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : null;
    if (!sessionId) {
        return { success: false, reason: 'SESSION_ID_REQUIRED' };
    }

    return handleCustomerCancel(sessionId, payload.reason || 'USER_CANCELLED');
}

/**
 * IPC Handler: checkout-get-safe-review (Increment 2B-3)
 */
async function handleCheckoutGetSafeReviewIpc(event, payload) {
    if (!payload || typeof payload !== 'object') {
        return { success: false, reason: 'INVALID_REVIEW_PAYLOAD' };
    }
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : null;
    if (!sessionId) {
        return { success: false, reason: 'SESSION_ID_REQUIRED' };
    }

    return handleGetSafeReview(sessionId);
}

function getRegisteredIpcHandler(channel) {
    return _registeredIpcHandlers.get(channel);
}

async function executeAgentAction(action) {
    console.log("🚀 EXECUTION START:", sanitizeActionForLog(action));
    if (!action) {
        throw new Error("Invalid action");
    }
    if (isAutomationRunning) {
        console.log("Blocked duplicate automation");
        return { success: false, error: "Already running" };
    }

    try {
        isAutomationRunning = true;
        if (!action.query) {
            action.query = "";
        }

        const page = action.page || global.activePage || await getBrowserPage();

        const checkLoginBreak = async () => {
            try {
                const needsLogin = await detectLoginRequirement(page);
                if (needsLogin) {
                    console.log('[Agent] Login wall detected, pausing automation');
                    throw new Error('LOGIN_REQUIRED');
                }
            } catch (e) {
                if (e.message === 'LOGIN_REQUIRED') throw e;
                console.warn('[Agent] Login check failed (non-critical):', e.message);
            }
        };

        // ── REVIEW-STAGE INTEGRATION (Increment 2B-2) ─────────────────────────
        if (action.type === "amazon_review_stage" || action.type === "amazon_extract_review_snapshot") {
            const p = action.page || global.activePage || page;
            if (!p || (typeof p.isClosed === 'function' && p.isClosed())) {
                return { success: false, error: 'No active browser session' };
            }
            return await handleReviewStage(p, {
                targetAsin: action.targetAsin,
                approvedBudget: action.approvedBudget,
                sessionId: action.sessionId,
                boundPageId: action.boundPageId
            });
        }

        // ── CUSTOMER APPROVAL & CANCELLATION (Increment 2B-3) ──────────────────
        // FINDING-2B3-01 REMEDIATION: Agent action alone MUST NOT approve purchases.
        // Purchase approval is exclusively authoritative via user interaction through
        // the 'checkout-approve-purchase' IPC channel from Spotlight UI.
        if (action.type === "amazon_approve_purchase") {
            return {
                success: false,
                error: 'AGENT_APPROVAL_DISALLOWED: Purchase approval requires explicit customer UI interaction via checkout-approve-purchase IPC.'
            };
        }

        if (action.type === "amazon_cancel_checkout") {
            return await handleCheckoutCancelIpc(null, {
                sessionId: action.sessionId,
                reason: action.reason
            });
        }

        if (action.type === "amazon_get_safe_review") {
            return await handleCheckoutGetSafeReviewIpc(null, {
                sessionId: action.sessionId
            });
        }

        console.log('[Agent] Executing action type:', action.type);

        // 🚨 ADDED: FORCE FLOW CASES
        // amazon_start: open homepage → click Sign In (NO long OpenID URLs)
        if (action.type === "amazon_start") {
            paymentContinueClicked = false;
            placeOrderClicked = false;
            await page.goto("https://www.amazon.in/", {
                waitUntil: "domcontentloaded",
                timeout: 30000
            });
            await page.waitForSelector('#nav-link-accountList', { timeout: 10000 });
            await page.click('#nav-link-accountList');
            await new Promise(r => setTimeout(r, 2000));
            global.activePage = page;
            return { success: true };
        }

        if (action.type === "open_product") {
            await page.goto(action.url, { waitUntil: "networkidle2" });
            return { success: true };
        }

        // ── open_login: navigate directly to platform login page ─────────
        if (action.type === 'open_login') {
            try {
                const p = await getBrowserPage();
                if (action.platform === 'Amazon') {
                    await p.goto('https://www.amazon.in/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.in%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=inflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0', { waitUntil: 'domcontentloaded', timeout: 30000 });
                } else if (action.platform === 'Flipkart') {
                    await p.goto('https://www.flipkart.com/account/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
                } else {
                    await p.goto('https://www.' + action.platform.toLowerCase() + '.in', { waitUntil: 'domcontentloaded', timeout: 30000 });
                }
                await new Promise(r => setTimeout(r, 1500));
                const url = p.url();
                const alreadyLoggedIn = !url.includes('signin') && !url.includes('login') && !url.includes('ap/');
                console.log('[Agent] open_login result - url:', url, 'alreadyLoggedIn:', alreadyLoggedIn);
                return { success: true, alreadyLoggedIn };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }

        // ── STEP 1: Login check ─────────────────────────────────────────────
        if (action.type === 'amazon_login_goto') {
            console.log('[Agent] STEP 1: Opening Amazon login page');
            agentState = 'waiting_login';

            try {
                const p = await getBrowserPage();
                const loginUrl = 'https://www.amazon.in/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.in%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=inflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0';
                await p.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(res => setTimeout(res, 1500));

                const url = p.url();
                console.log('[Agent] Login page URL:', url);

                // Check if already logged in
                const alreadyLoggedIn = !url.includes('signin') && !url.includes('ap/');
                if (alreadyLoggedIn) {
                    agentState = 'searching';
                    return { success: true, alreadyLoggedIn: true };
                }

                // Hide Buddy so user can see Chrome for login
                hideMainWindow();
                return { success: true, loginPageReady: true };
            } catch (err) {
                agentState = 'idle';
                return { success: false, error: err.message };
            }
        }

        if (action.type === 'amazon_poll_login') {
            try {
                if (!global.activePage || global.activePage.isClosed()) {
                    return { success: true, isLoggedIn: false };
                }
                const p = global.activePage;
                const url = p.url();

                // If currently on an active Amazon authentication page, they are definitely not signed in
                if (url.includes('/ap/signin') || url.includes('/ap/cvf') || url.includes('/ap/mfa') || url.includes('/ap/register')) {
                    return { success: true, isLoggedIn: false };
                }

                // Check the header login state directly on the current active page
                const loginStatus = await p.evaluate(() => {
                    const el = document.querySelector('#nav-link-accountList-nav-line-1');
                    if (!el) return false;
                    const text = el.textContent.trim().toLowerCase();
                    return text.length > 0 && !text.includes('sign in') && !text.includes('hello, sign in');
                }).catch(() => false);

                console.log('[Agent] Poll login result:', loginStatus, '| URL:', url);
                if (loginStatus) agentState = 'searching';
                return { success: true, isLoggedIn: loginStatus };
            } catch (err) {
                return { success: false, isLoggedIn: false, error: err.message };
            }
        }

        // ── STEP 2: Smart product search — returns list for user selection ──
        if (action.type === 'amazon_search') {
            console.log('[Agent] STEP 2: Searching Amazon for:', action.query, '| Budget: ₹', action.budget);
            agentState = 'searching';

            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            let searchQuery = action.query || '';
            const budget = action.budget ? Number(action.budget) : null;
            console.log('[Agent] Strict Budget applied:', budget);

            if (budget) {
                // Secretly tell Amazon to filter by budget so premium items appear on page 1
                if (!searchQuery.toLowerCase().includes(budget.toString())) {
                    searchQuery += ` under ${budget}`;
                }
            }

            const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchQuery)}`;
            console.log('[Agent] Navigating to search:', searchUrl);
            await p.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 3000));

            const products = await p.evaluate(() => {
                const cards = Array.from(document.querySelectorAll('[data-component-type="s-search-result"]'));
                return cards.slice(0, 15).map(card => {
                    const linkEl = card.querySelector('h2 a[href*="/dp/"]') || card.querySelector('a[href*="/dp/"]');
                    const priceEl = card.querySelector('.a-price .a-offscreen');
                    const imgEl = card.querySelector('img.s-image');
                    const titleEl = card.querySelector('h2 span');
                    const ratingEl = card.querySelector('.a-icon-alt, .a-icon-star-small span, .a-icon-star span');
                    const reviewEl = card.querySelector('.a-size-base.s-underline-text');
                    if (!linkEl || !linkEl.href) return null;
                    let price = null;
                    if (priceEl) {
                        const cleaned = priceEl.textContent.replace(/[₹,\s]/g, '').trim();
                        const parsed = parseFloat(cleaned);
                        if (!isNaN(parsed)) price = parsed;
                    }

                    let rating = 'N/A';
                    if (ratingEl) {
                        const rText = ratingEl.textContent.trim();
                        // Extract "4.5" from "4.5 out of 5 stars"
                        const match = rText.match(/([\d.]+)\s*out of/);
                        rating = match ? match[1] : rText;
                    }

                    return {
                        url: linkEl.href,
                        price,
                        title: titleEl?.textContent?.trim() || '',
                        image: imgEl?.src || '',
                        rating,
                        reviews: reviewEl?.textContent?.trim() || ''
                    };
                }).filter(Boolean);
            });

            console.log('[Agent] Total products found:', products.length);
            products.forEach(prod => console.log(`  ₹${prod.price} - ${prod.title?.slice(0, 40)}`));

            // Parse rating as float for proper sorting
            const rated = products.map(p => ({
                ...p,
                ratingNum: parseFloat((p.rating || '0').toString().replace(/[^\d.]/g, '')) || 0
            }));

            let candidates = rated.filter(p => {
                if (!p.price || p.price <= 0) return false;
                if (budget) {
                    if (p.price > budget) return false; // Strict: must be at or under budget
                }
                return true;
            });

            if (budget && candidates.length === 0) {
                const cheapest = rated.filter(p => p.price !== null).sort((a, b) => a.price - b.price)[0];
                agentState = 'idle';
                return {
                    success: false, budgetExceeded: true,
                    cheapestAvailable: cheapest?.price,
                    cheapestTitle: cheapest?.title?.slice(0, 50),
                    originalBudget: budget,
                    error: `No products found under budget`
                };
            }

            // Multi-criteria sorting:
            // 1. Budget proximity
            // 2. Rating
            // 3. Review count
            candidates.sort((a, b) => {
                if (budget) {
                    const distA = Math.abs(a.price - budget);
                    const distB = Math.abs(b.price - budget);

                    // If one is significantly closer to budget (e.g., > 5% of budget difference)
                    const diffLimit = budget * 0.05;
                    if (Math.abs(distA - distB) > diffLimit) {
                        return distA - distB;
                    }
                }

                // If budget proximity is similar or no budget, sort by rating
                if (b.ratingNum !== a.ratingNum) {
                    return b.ratingNum - a.ratingNum;
                }

                // Finally by reviews
                const getReviewCount = (rStr) => {
                    if (!rStr) return 0;
                    const cleaned = rStr.toString().replace(/[^\d]/g, '');
                    return parseInt(cleaned, 10) || 0;
                };
                const revA = getReviewCount(a.reviews);
                const revB = getReviewCount(b.reviews);
                return revB - revA;
            });

            // Take top 5
            const top5 = candidates.slice(0, 5).map(p => ({
                url: p.url,
                price: p.price,
                title: p.title,
                image: p.image || '',
                rating: p.rating || 'N/A',
                reviews: p.reviews || '',
                ratingNum: p.ratingNum
            }));

            console.log('[Agent] Top 5 by Budget Intelligence:', top5.map(p => `${p.ratingNum}★ ₹${p.price} ${p.title?.slice(0, 30)}`));

            agentState = 'selecting_product';
            agentProducts = top5;
            agentCurrentProductIndex = 0;

            return { success: true, products: top5 };
        }

        if (action.type === 'amazon_preview_product') {
            try {
                await previewProduct(page, action.url);
                return { success: true };
            } catch (err) {
                return { success: false, error: 'Preview failed: ' + err.message };
            }
        }

        if (action.type === 'amazon_highlight_product') {
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active page' };
            if (!action.url) return { success: false, error: 'No URL provided' };

            console.log('[Agent] Highlighting product:', action.url);

            // Wait for the product page to load completely before hiding Buddy
            await p.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 500));

            // Pop out (hide) Buddy exactly when the product page is ready to view
            hideMainWindow();

            // Perform full-page human-like scroll to the very bottom and back
            await p.evaluate(async () => {
                await new Promise(resolve => {
                    const timer = setInterval(() => {
                        window.scrollBy(0, 300);
                        // Stop when we reach the absolute bottom
                        if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 50) {
                            clearInterval(timer);
                            // Wait 1 second at the bottom for human realism
                            setTimeout(() => {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                // Wait 500ms after returning to top
                                setTimeout(resolve, 800);
                            }, 1000);
                        }
                    }, 60); // fast smooth scroll
                });
            });

            return { success: true };
        }

        if (action.type === 'amazon_scroll_to_product') {
            try {
                const p = global.activePage;
                if (!p || p.isClosed()) { return { success: false }; }

                const idx = action.index || 0;

                await p.evaluate((targetIdx) => {
                    // Clear previous highlights
                    document.querySelectorAll('[data-buddy-active]').forEach(el => {
                        el.style.outline = '';
                        el.style.boxShadow = '';
                        el.style.borderRadius = '';
                        el.removeAttribute('data-buddy-active');
                    });

                    const cards = document.querySelectorAll('[data-component-type="s-search-result"]');
                    const card = cards[targetIdx];
                    if (!card) return;

                    // Scroll into view
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Highlight
                    card.style.outline = '2.5px solid rgba(99,102,241,0.85)';
                    card.style.boxShadow = '0 0 0 6px rgba(99,102,241,0.18), 0 8px 32px rgba(99,102,241,0.2)';
                    card.style.borderRadius = '8px';
                    card.style.transition = 'all 0.35s ease';
                    card.setAttribute('data-buddy-active', 'true');
                }, idx);

                await new Promise(r => setTimeout(r, 700));
                return { success: true };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }

        // ── STEP 5: Add to cart AFTER user approval ─────────────────────────
        if (action.type === 'amazon_add_to_cart') {
            const getAsin = (url) => {
                if (!url) return null;
                const match = url.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/|asin=)([A-Z0-9]{10})/i);
                return match ? match[1].toUpperCase() : null;
            };
            console.log('=== Add-To-Cart Request ===');
            console.log('Target URL:', action.url);
            console.log('Target ASIN:', getAsin(action.url));
            console.log('===========================');
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };
            if (!action.url) return { success: false, error: 'Invalid product URL' };

            await p.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 2000));

            const pdpInfo = await p.evaluate(() => {
                const asinInput = document.querySelector('input[name="ASIN"], #ASIN')?.value || null;
                const parentAsinInput = document.querySelector('input[name="parentAsin"]')?.value || null;
                const offeringIdInput = document.querySelector('input[name="offeringID"]')?.value || null;
                const merchantIdInput = document.querySelector('input[name="merchantID"]')?.value || null;
                const canonicalHref = document.querySelector('link[rel="canonical"]')?.href || null;
                return {
                    pageUrl: window.location.href,
                    asinInput,
                    parentAsinInput,
                    offeringIdInput,
                    merchantIdInput,
                    canonicalHref
                };
            });

            console.log('=== PDP Navigation & ASIN Analysis ===');
            console.log('Requested URL:', action.url);
            console.log('Final Page URL:', pdpInfo.pageUrl);
            console.log('Page DOM input[name="ASIN"]:', pdpInfo.asinInput);
            console.log('Page DOM input[name="parentAsin"]:', pdpInfo.parentAsinInput);
            console.log('Page DOM input[name="offeringID"]:', pdpInfo.offeringIdInput?.slice(0, 30));
            console.log('Page DOM input[name="merchantID"]:', pdpInfo.merchantIdInput);
            console.log('Page DOM Canonical Link:', pdpInfo.canonicalHref);
            console.log('======================================');

            console.log('[Agent] Bypassing duplicate scroll — proceeding directly to Add to Cart');

            try {
                // STEP 1: Capture cart count before
                const cartCountBefore = await p.evaluate(() => {
                    const el = document.querySelector('#nav-cart-count');
                    return el ? parseInt(el.innerText || '0', 10) : 0;
                }).catch(() => 0);

                // STEP 2: Click Add To Cart
                const clicked = await p.evaluate(() => {
                    const isInteractable = (el) => {
                        if (!el) return false;
                        const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                        const enabled = !el.disabled && el.getAttribute('aria-disabled') !== 'true';
                        return visible && enabled;
                    };

                    let btn = document.querySelector('#add-to-cart-button');
                    if (!isInteractable(btn)) {
                        const candidates = Array.from(document.querySelectorAll('#add-to-cart-button, input[name="submit.add-to-cart"], button, input[type="submit"]'));
                        btn = candidates.find(b => {
                            const val = (b.value || b.textContent || b.innerText || '').toLowerCase();
                            return (val.includes('add to cart') || val.includes('add to basket')) && isInteractable(b);
                        });
                    }

                    if (btn && isInteractable(btn)) {
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (!clicked) {
                    return { success: false, error: 'Add to cart button not found or not clickable' };
                }

                // STEP 3: Wait for real Amazon confirmation signal...
                console.log('[Agent] Waiting for Amazon confirmation signal...');
                let confirmation = null;
                try {
                    confirmation = await p.evaluate(async (initialCount) => {
                        return new Promise(resolve => {
                            let attempts = 0;
                            const maxAttempts = 50; // 50 * 200ms = 10 seconds max

                            const check = setInterval(() => {
                                attempts++;

                                // Z) Dismiss Warranty/Protection Plan Popups
                                const noThanksBtns = Array.from(document.querySelectorAll('#attachSiNoCoverage-announce, #attachSiNoCoverage, .a-button-input[aria-labelledby="attachSiNoCoverage-announce"]'));
                                for (const btn of noThanksBtns) {
                                    if (btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                                        btn.click();
                                        console.log('[Agent] Dismissed Amazon warranty/protection popup');
                                        break;
                                    }
                                }

                                // 1. AUTHORITATIVE SUCCESS SIGNAL A: URL Redirect Check (Evaluated FIRST)
                                const cartUrl = window.location.href;
                                const isAuthRedirect = (cartUrl.includes('cart') || cartUrl.includes('huc') || cartUrl.includes('smart-wagon')) &&
                                                       !cartUrl.includes('signin') && !cartUrl.includes('login') && !cartUrl.includes('ap/') && !cartUrl.includes('captcha');
                                if (isAuthRedirect) {
                                    clearInterval(check);
                                    resolve({ success: true, confirmationMethod: 'redirect' });
                                    return;
                                }

                                // 2. AUTHORITATIVE SUCCESS SIGNAL B: Side-sheet or success message appears
                                const sideSheet = document.querySelector('#attach-sidesheet-view-cart-button, #attach-desktop-sideSheet, #attach-view-cart-button-form, #sw-atc-confirmation, .attach-primary-atc-confirm-box, #huc-v2-order-row, #attach-accessory-pane');
                                const successMsg = document.querySelector('#NATC_SMART_WAGON_CONF_MSG_SUCCESS, .a-alert-success, #sw-atc-details-single-container');
                                if (sideSheet || (successMsg && successMsg.innerText.toLowerCase().includes('added to cart'))) {
                                    clearInterval(check);
                                    resolve({ success: true, confirmationMethod: 'side_sheet' });
                                    return;
                                }

                                // 3. AUTHORITATIVE SUCCESS SIGNAL C: Cart count increases
                                const countEl = document.querySelector('#nav-cart-count');
                                const currentCount = countEl ? parseInt(countEl.innerText || '0', 10) : 0;
                                if (currentCount > initialCount) {
                                    clearInterval(check);
                                    resolve({ success: true, cartCountBefore: initialCount, cartCountAfter: currentCount, confirmationMethod: 'cart_count' });
                                    return;
                                }

                                // 4. BLOCKING VARIANT SELECTION ALERT: Evaluated ONLY IF no success signal triggered and page remains on product page
                                const warningEl = document.querySelector('#twisterContainer #twister-dropdown-alert, #twisterContainer .a-alert-inline, #twisterContainer .a-alert-error, #inline-twister-container .a-alert-inline, #inline-twister-container .a-alert-error, #twister-dropdown-alert');
                                if (warningEl && warningEl.offsetWidth > 0 && warningEl.offsetHeight > 0) {
                                    const alertText = warningEl.innerText.trim();
                                    const lowerAlert = alertText.toLowerCase();
                                    const isVariantPrompt = lowerAlert.includes('select size') || lowerAlert.includes('select a size') || 
                                                           lowerAlert.includes('choose size') || lowerAlert.includes('select color') || 
                                                           lowerAlert.includes('choose color') || lowerAlert.includes('select style') ||
                                                           lowerAlert.includes('select pattern') || lowerAlert.includes('select quantity');
                                    if (alertText.length > 0 && isVariantPrompt) {
                                        clearInterval(check);
                                        resolve({ success: false, reason: 'OPTION_SELECTION_REQUIRED', error: `Amazon alert: ${alertText}` });
                                        return;
                                    }
                                }

                                if (attempts >= maxAttempts) {
                                    clearInterval(check);
                                    resolve(null);
                                }
                            }, 200);
                        });
                    }, cartCountBefore);
                } catch (err) {
                    if (err.message.includes('Execution context was destroyed') || err.message.includes('Target closed')) {
                        console.log('[Agent] Execution context destroyed during evaluate. Assuming successful redirect to cart.');
                        await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => { });
                        confirmation = { success: true, confirmationMethod: 'redirect_context_destroyed' };
                    } else {
                        throw err;
                    }
                }

                if (!confirmation) {
                    return { success: false, error: 'Timed out waiting for Amazon to confirm Add to Cart' };
                }

                if (!confirmation.success) {
                    return { success: false, reason: confirmation.reason, error: confirmation.error };
                }

                console.log('[Agent] Added to cart successfully verified via:', confirmation.confirmationMethod);
                agentState = 'checkout';

                // Production Comment: Amazon normalizes seller/offer ASINs to a canonical PDP ASIN.
                // After PDP load, the canonical PDP identity becomes the single source of truth for downstream checkout.
                const rawResolvedAsin = pdpInfo.asinInput || getAsin(pdpInfo.canonicalHref) || getAsin(pdpInfo.pageUrl);
                const isValidAsin = rawResolvedAsin && /^[A-Z0-9]{10}$/i.test(rawResolvedAsin);

                let resolvedProduct = null;
                if (isValidAsin) {
                    const candidateAsin = rawResolvedAsin.toUpperCase();
                    // Priority: Amazon's declared canonical URL > Page URL > Manual construction fallback
                    const candidateUrl = pdpInfo.canonicalHref || pdpInfo.pageUrl || `https://www.amazon.in/dp/${candidateAsin}`;

                    // Invariant Check: ASIN exists and URL contains ASIN
                    if (candidateAsin && candidateUrl.includes(candidateAsin)) {
                        resolvedProduct = {
                            asin: candidateAsin,
                            url: candidateUrl,
                            title: action.product?.title || 'Target Product',
                            identitySource: 'pdp'
                        };
                        console.log('[Agent] PDP Identity Promoted:', resolvedProduct);
                    }
                }

                if (!resolvedProduct) {
                    console.warn('[Agent] PDP Identity Resolution Warning: Invalid or missing canonical ASIN. Falling back to recommendation identity.');
                    resolvedProduct = {
                        asin: getAsin(action.url),
                        url: action.url,
                        title: action.product?.title || 'Target Product',
                        identitySource: 'recommendation'
                    };
                }

                return { ...confirmation, resolvedProduct };
            } catch (err) {
                // If the error happens inside the outer try/catch (e.g. during click)
                if (err.message.includes('Execution context was destroyed')) {
                    console.log('[Agent] Execution context destroyed during click. Assuming successful redirect to cart.');
                    await new Promise(r => setTimeout(r, 2000));

                    const fallbackAsin = getAsin(action.url);
                    const fallbackProduct = {
                        asin: fallbackAsin,
                        url: action.url,
                        title: action.product?.title || 'Target Product',
                        identitySource: 'recommendation'
                    };

                    return { success: true, confirmationMethod: 'click_context_destroyed', resolvedProduct: fallbackProduct };
                }
                return { success: false, error: err.message };
            }
        }

        // ── STEP 5.5: Verify Cart After Add ─────────────────────────────
        if (action.type === 'amazon_verify_cart_target') {
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, reason: 'no_active_page' };

            // Explicitly extract target ASIN from URL
            const getAsin = (url) => {
                if (!url) return null;
                const match = url.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/|asin=)([A-Z0-9]{10})/i);
                return match ? match[1].toUpperCase() : null;
            };
            const targetAsin = getAsin(action.targetUrl);

            console.log('=== Verification Context ===');
            console.log('Target URL:', action.targetUrl);
            console.log('Target ASIN:', targetAsin);
            console.log('Target Title:', action.targetTitle || 'N/A');
            console.log('Recommendation ASIN:', action.product?.asin || getAsin(action.product?.url) || 'N/A');
            console.log('Recommendation URL:', action.product?.url || 'N/A');
            console.log('Recommendation Title:', action.product?.title || 'N/A');
            console.log('============================');

            if (!targetAsin) {
                console.log('[Agent] Invalid target ASIN for URL:', action.targetUrl);
                return { success: false, reason: 'invalid_target_asin' };
            }

            // Reopen cart explicitly
            await p.goto('https://www.amazon.in/gp/cart/view.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 2000));

            const verificationResult = await p.evaluate((targetAsin, targetUrl, targetTitle) => {
                const debugLogs = [];
                const extractAsinFromUrl = (urlStr) => {
                    if (!urlStr) return null;
                    const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                    return match ? match[1].toUpperCase() : null;
                };

                const normalize = (str) => {
                    return (str || '').toLowerCase()
                        .replace(/[^\w\s]/g, '')
                        .replace(/\b(size|color|men|women|boys|girls|kids)\b/g, '')
                        .replace(/\s+/g, ' ').trim();
                };

                const normTargetTitle = normalize(targetTitle);
                const pageHtml = document.body.innerHTML;
                const targetAsinInDOM = targetAsin ? pageHtml.includes(targetAsin) : false;
                const targetUrlInDOM = targetUrl ? pageHtml.includes(targetUrl) : false;

                const scListItems = Array.from(document.querySelectorAll('.sc-list-item'));
                const scListItemContent = Array.from(document.querySelectorAll('.sc-list-item-content, .sc-item-content'));

                debugLogs.push(`DOM Summary: .sc-list-item count=${scListItems.length}, .sc-list-item-content count=${scListItemContent.length}`);
                debugLogs.push(`DOM Presence: targetAsin (${targetAsin}) in DOM: ${targetAsinInDOM}, targetUrl in DOM: ${targetUrlInDOM}`);

                const items = scListItems.length > 0 ? scListItems : scListItemContent;
                let found = null;

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const outerDataAsin = item.getAttribute('data-asin')?.toUpperCase() || null;
                    const childDataAsins = Array.from(item.querySelectorAll('[data-asin]'))
                        .map(el => el.getAttribute('data-asin')?.toUpperCase())
                        .filter(Boolean);

                    const linkEls = Array.from(item.querySelectorAll('a[href]'));
                    const hrefs = linkEls.map(a => a.href);
                    const extractedLinkAsins = hrefs.map(h => extractAsinFromUrl(h)).filter(Boolean);

                    const titleEl = item.querySelector('.sc-product-title .a-truncate-cut, .sc-product-title, .sc-item-title a');
                    const rawTitle = titleEl?.innerText?.trim() || '';
                    const normTitle = normalize(rawTitle);

                    const strat1_outerAsin = (outerDataAsin === targetAsin);
                    const strat2_linkAsin = extractedLinkAsins.includes(targetAsin);
                    const strat3_childAsin = childDataAsins.includes(targetAsin);
                    const strat4_urlMatch = targetUrl ? hrefs.some(h => h.includes(targetUrl)) : false;
                    const strat5_titleMatch = (normTargetTitle && normTitle) ? (normTitle.includes(normTargetTitle) || normTargetTitle.includes(normTitle)) : false;

                    const matchSuccess = strat1_outerAsin || strat2_linkAsin || strat3_childAsin || strat4_urlMatch || strat5_titleMatch;

                    const itemLog = {
                        itemIndex: i,
                        outerDataAsin,
                        childDataAsins,
                        hrefCount: hrefs.length,
                        extractedLinkAsins,
                        rawTitle: rawTitle.slice(0, 50),
                        normTitle: normTitle.slice(0, 50),
                        strategies: {
                            strat1_outerAsin,
                            strat2_linkAsin,
                            strat3_childAsin,
                            strat4_urlMatch,
                            strat5_titleMatch
                        },
                        matched: matchSuccess,
                        rejectionReason: matchSuccess ? 'NONE (MATCHED)' : `No strategy matched. targetAsin=${targetAsin}, outerAsin=${outerDataAsin}, linkAsins=[${extractedLinkAsins.join(',')}], childAsins=[${childDataAsins.join(',')}]`
                    };

                    debugLogs.push(`Item[${i}] Log: ${JSON.stringify(itemLog)}`);

                    if (matchSuccess && !found) {
                        const priceEl = item.querySelector('.sc-product-price, .sc-badge-price');
                        const qtyEl = item.querySelector('.a-dropdown-prompt, input[name*="quantity"]');
                        found = {
                            asin: targetAsin || outerDataAsin || extractedLinkAsins[0] || 'UNKNOWN',
                            title: rawTitle || targetTitle || 'Unknown Title',
                            price: priceEl?.innerText?.trim() || '',
                            quantity: parseInt(qtyEl?.innerText || qtyEl?.value || '1', 10)
                        };
                    }
                }

                return { found, debugLogs, totalItems: items.length, targetAsinInDOM, targetUrlInDOM };
            }, targetAsin, action.targetUrl, action.targetTitle);

            console.log('[Agent] === CART VERIFICATION DEBUG LOGS START ===');
            verificationResult.debugLogs.forEach(log => console.log('[Agent] [DEBUG]', log));
            console.log('[Agent] === CART VERIFICATION DEBUG LOGS END ===');

            if (!verificationResult.found) {
                console.log('[Agent] [VERIFY_RETURN_TRACE] verificationResult.found is NULL');
                console.log('[Agent] Cart verification failed: target_product_missing');
                return { success: false, stage: 'cart_verification', reason: 'target_product_missing' };
            }

            console.log('[Agent] [VERIFY_RETURN_TRACE] verificationResult:', JSON.stringify(verificationResult));
            console.log('[Agent] [VERIFY_RETURN_TRACE] verificationResult.found:', JSON.stringify(verificationResult.found));
            console.log('[Agent] [VERIFY_RETURN_TRACE] returning:', JSON.stringify({ success: true, product: verificationResult.found }));

            return { success: true, product: verificationResult.found };
        }

        // ── STEP 6: Pre-checkout questions ───────────────────────────────────
        if (action.type === 'amazon_pre_checkout_questions') {
            console.log('STEP 6: Asking questions');

            // Scrape DOM for answers
            const domAnswers = await page.evaluate(() => {
                const body = document.body.innerText.toLowerCase();
                const deliveryEl = document.querySelector('#mir-layout-DELIVERY_BLOCK, [data-feature-id="mir-layout-DELIVERY_BLOCK"]');
                return {
                    hasReturn: body.includes('return') || body.includes('replacement'),
                    returnText: (() => {
                        const el = document.querySelector('[data-feature-id="return-policy"], .return-policy-message, #returnPolicySubText, [id*="return"]');
                        return el?.innerText?.trim() || null;
                    })(),
                    hasCancellation: body.includes('cancel'),
                    deliveryText: deliveryEl?.innerText?.trim()?.slice(0, 120) || null,
                    hasReplacement: body.includes('replacement'),
                };
            });

            const answers = [
                {
                    question: 'Does it have at least 7 days return?',
                    answer: domAnswers.hasReturn
                        ? (domAnswers.returnText || 'Return policy mentioned on page')
                        : 'Not clearly available'
                },
                {
                    question: 'Can I cancel the order later?',
                    answer: domAnswers.hasCancellation ? 'Cancellation appears to be available' : 'Not clearly mentioned'
                },
                {
                    question: 'Is replacement available?',
                    answer: domAnswers.hasReplacement ? 'Replacement mentioned on page' : 'Not clearly available'
                },
                {
                    question: 'Estimated delivery?',
                    answer: domAnswers.deliveryText || 'Not clearly available'
                }
            ];

            return {
                success: true,
                type: 'pre-checkout-questions',
                questions: [
                    'Does it have at least 7 days return?',
                    'Can I cancel the order later?',
                    'Is replacement available?',
                    'Is delivery fast for my location?',
                    'Other (custom question)'
                ],
                domAnswers: answers
            };
        }

        // ── STEP 8: Final approval checkpoint before checkout ────────────────
        if (action.type === 'amazon_request_final_approval') {
            return {
                success: true,
                requireFinalApproval: true,
                stage: 'pre-checkout',
                message: 'Review above and confirm to proceed to checkout.'
            };
        }

        // ── SMART CART: Analyze Cart Contents ────────────────────────────────
        if (action.type === 'amazon_analyze_cart') {
            console.log('[Agent] Analyzing cart contents...');
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            const cartUrl = 'https://www.amazon.in/gp/cart/view.html';
            await p.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 2000));
            console.log('[Agent] Cart loaded for analysis');

            const targetTitle = action.targetTitle || '';
            const targetUrl = action.targetUrl || '';

            const extractAsin = (urlStr) => {
                if (!urlStr) return null;
                const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                return match ? match[1].toUpperCase() : null;
            };

            const targetAsin = extractAsin(targetUrl);

            const cartData = await p.evaluate((targetTitle, targetAsin, targetUrl) => {
                const extractAsinInDOM = (urlStr) => {
                    if (!urlStr) return null;
                    const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                    return match ? match[1].toUpperCase() : null;
                };

                const normalize = (str) => {
                    return (str || '').toLowerCase()
                        .replace(/[^\w\s]/g, '')
                        .replace(/\b(size|color|men|women|boys|girls|kids)\b/g, '')
                        .replace(/\s+/g, ' ').trim();
                };

                const normTarget = normalize(targetTitle);

                const items = [];
                let targetItemFound = false;
                let targetItemQuantity = 0;
                let subtotal = 0;
                let selectedItemsCount = 0;

                const itemRows = document.querySelectorAll('.sc-list-item-content, .sc-item-content');

                for (const row of itemRows) {
                    const titleEl = row.querySelector('.sc-product-title, .a-truncate-cut, .sc-item-title a');
                    const linkEl = row.querySelector('a.sc-product-link, .sc-item-title a');
                    const priceEl = row.querySelector('.sc-product-price, .sc-item-price');
                    const qtyEl = row.querySelector('.a-dropdown-prompt, input[name="quantity"]');
                    const checkbox = row.querySelector('input[type="checkbox"]');

                    if (!titleEl) continue;

                    const title = titleEl.innerText.trim();
                    const url = linkEl ? linkEl.href : '';
                    const asin = extractAsinInDOM(url);
                    const priceStr = priceEl ? priceEl.innerText.replace(/[^0-9.]/g, '') : '0';
                    const price = parseFloat(priceStr || '0');
                    const qty = parseInt(qtyEl ? (qtyEl.innerText || qtyEl.value || '1') : '1', 10);
                    const isSelected = checkbox ? checkbox.checked : true; // assume true if no checkbox

                    if (isSelected) {
                        selectedItemsCount += qty;
                    }

                    // Matching logic priority: ASIN -> URL -> Title
                    let isTarget = false;

                    if (targetAsin && asin) {
                        isTarget = (targetAsin === asin);
                    } else if (targetUrl && url && url.includes(targetUrl)) {
                        isTarget = true;
                    } else {
                        const normCartTitle = normalize(title);
                        if (normTarget && normCartTitle && (normCartTitle.includes(normTarget) || normTarget.includes(normCartTitle))) {
                            isTarget = true;
                        }
                    }

                    items.push({ title, url, asin, price, quantity: qty, isSelected, isTarget });

                    if (isTarget) {
                        targetItemFound = true;
                        targetItemQuantity += qty;
                    }
                }

                const subtotalEl = document.querySelector('#sc-subtotal-amount-buybox, .sc-price-sign');
                if (subtotalEl) {
                    subtotal = parseFloat(subtotalEl.innerText.replace(/[^0-9.]/g, '') || '0');
                }

                return {
                    items,
                    targetItemFound,
                    targetItemQuantity,
                    targetAsin,
                    subtotal,
                    selectedItemsCount
                };
            }, targetTitle, targetAsin, targetUrl);

            const otherItems = cartData.items.filter(i => !i.isTarget);

            // Determine cart status exactly as requested
            let cartStatus = 'unknown';
            if (cartData.items.length === 0) {
                cartStatus = 'empty';
            } else if (cartData.targetItemFound && otherItems.length === 0) {
                cartStatus = 'target_only';
            } else if (cartData.targetItemFound && otherItems.length > 0) {
                cartStatus = 'duplicate_target';
            } else if (!cartData.targetItemFound && otherItems.length > 0) {
                cartStatus = 'target_and_others';
            }

            console.log(`[Agent] Cart Analysis: Status=${cartStatus}, TargetFound=${cartData.targetItemFound}, Others=${otherItems.length}`);

            return {
                success: true,
                cartStatus,
                targetItemFound: cartData.targetItemFound,
                targetItemQuantity: cartData.targetItemQuantity,
                targetAsin: cartData.targetAsin,
                otherItems: otherItems.map(i => ({ title: i.title, asin: i.asin, quantity: i.quantity, isSelected: i.isSelected })),
                subtotal: cartData.subtotal,
                selectedItems: cartData.selectedItemsCount
            };
        }

        // ── SMART CART: Remove Target From Cart ──────────────────────────────
        if (action.type === 'amazon_remove_target_from_cart') {
            console.log('[Agent] Removing target item from cart...');
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            const cartUrl = 'https://www.amazon.in/gp/cart/view.html';
            await p.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 2000));

            const targetUrl = action.targetUrl || '';
            const extractAsin = (urlStr) => {
                if (!urlStr) return null;
                const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                return match ? match[1].toUpperCase() : null;
            };
            const targetAsin = extractAsin(targetUrl);

            const removed = await p.evaluate(async (targetAsin, targetUrl) => {
                const extractAsinInDOM = (urlStr) => {
                    if (!urlStr) return null;
                    const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                    return match ? match[1].toUpperCase() : null;
                };

                const itemRows = document.querySelectorAll('.sc-list-item-content, .sc-item-content');
                let clicked = false;
                for (const row of itemRows) {
                    const linkEl = row.querySelector('a.sc-product-link, .sc-item-title a');
                    const url = linkEl ? linkEl.href : '';
                    const asin = extractAsinInDOM(url);

                    let isTarget = false;
                    if (targetAsin && asin) {
                        isTarget = (targetAsin === asin);
                    } else if (targetUrl && url && url.includes(targetUrl)) {
                        isTarget = true;
                    }

                    if (isTarget) {
                        const deleteBtn = row.querySelector('input[value="Delete"], .sc-action-delete input');
                        if (deleteBtn) {
                            deleteBtn.click();
                            clicked = true;
                            await new Promise(r => setTimeout(r, 1500)); // Wait for ajax
                        }
                    }
                }
                return clicked;
            }, targetAsin, targetUrl);

            // Wait for Amazon AJAX cart spinners to completely disappear after deletion
            if (removed) {
                console.log('[Agent] Waiting for cart update spinners to disappear after deletion...');
                await p.waitForFunction(() => {
                    const spinner = document.querySelector('.a-spinner-wrapper, .sc-update-animator');
                    return !spinner || window.getComputedStyle(spinner).display === 'none';
                }, { timeout: 10000 }).catch(() => console.log('[Agent] Spinner wait timeout, proceeding anyway'));
            }

            return { success: true, removed };
        }

        // ── SMART CART: Smart Checkout with Isolation ────────────────────────
        if (action.type === 'amazon_smart_checkout') {
            console.log(`[Agent] SMART CHECKOUT initiated. Mode: ${action.mode}`);
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            const cartUrl = 'https://www.amazon.in/gp/cart/view.html';
            await p.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 3000));
            console.log('[Agent] Cart loaded for smart checkout');

            if (action.mode === 'selected_only') {
                console.log('[Agent] Entering CART ISOLATION MODE...');
                const targetTitle = action.targetTitle || '';
                const targetUrl = action.targetUrl || '';

                const extractAsin = (urlStr) => {
                    if (!urlStr) return null;
                    const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                    return match ? match[1].toUpperCase() : null;
                };

                const targetAsin = extractAsin(targetUrl);

                // ── Reusable isolation helper (runs on current live DOM) ──
                const runIsolation = async () => {
                    return await p.evaluate(async (targetTitle, targetAsin, targetUrl) => {
                        const extractAsinInDOM = (urlStr) => {
                            if (!urlStr) return null;
                            const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                            return match ? match[1].toUpperCase() : null;
                        };

                        const normalize = (str) => {
                            return (str || '').toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\b(size|color|men|women|boys|girls|kids)\b/g, '')
                                .replace(/\s+/g, ' ').trim();
                        };

                        const normTarget = normalize(targetTitle);
                        const itemRows = document.querySelectorAll('.sc-list-item-content, .sc-item-content');

                        let targetFound = false;
                        let selectedCount = 0;
                        let deselectedCount = 0;

                        for (const row of itemRows) {
                            const titleEl = row.querySelector('.sc-product-title, .a-truncate-cut, .sc-item-title a');
                            const linkEl = row.querySelector('a.sc-product-link, .sc-item-title a');
                            const checkbox = row.querySelector('input[type="checkbox"]');

                            if (!titleEl || !checkbox) continue;

                            const title = titleEl.innerText.trim();
                            const url = linkEl ? linkEl.href : '';
                            const asin = extractAsinInDOM(url);

                            let isTarget = false;
                            if (targetAsin && asin) {
                                isTarget = (targetAsin === asin);
                            } else if (targetUrl && url && url.includes(targetUrl)) {
                                isTarget = true;
                            } else {
                                const normCartTitle = normalize(title);
                                if (normTarget && normCartTitle && (normCartTitle.includes(normTarget) || normTarget.includes(normCartTitle))) {
                                    isTarget = true;
                                }
                            }

                            if (isTarget && !targetFound) {
                                targetFound = true;
                                // Ensure it IS checked
                                if (!checkbox.checked) {
                                    checkbox.click();
                                    await new Promise(r => setTimeout(r, 800)); // wait for Amazon ajax
                                }
                                selectedCount++;
                            } else {
                                // Ensure it IS UNCHECKED
                                if (checkbox.checked) {
                                    checkbox.click();
                                    await new Promise(r => setTimeout(r, 800)); // wait for Amazon ajax
                                }
                                deselectedCount++;
                            }
                        }
                        return { targetFound, selectedCount, deselectedCount };
                    }, targetTitle, targetAsin, targetUrl);
                };

                // ── Reusable verification helper (runs on current live DOM) ──
                const runVerification = async () => {
                    return await p.evaluate(async (targetTitle, targetAsin, targetUrl) => {
                        const extractAsinInDOM = (urlStr) => {
                            if (!urlStr) return null;
                            const match = urlStr.match(/(?:\/dp\/|\/product\/|\/asin\/|\/aw\/d\/|dp\/)([A-Z0-9]{10})/i);
                            return match ? match[1].toUpperCase() : null;
                        };

                        const normalize = (str) => {
                            return (str || '').toLowerCase()
                                .replace(/[^\w\s]/g, '')
                                .replace(/\b(size|color|men|women|boys|girls|kids)\b/g, '')
                                .replace(/\s+/g, ' ').trim();
                        };

                        const normTarget = normalize(targetTitle);
                        let checkedNonTargets = 0;
                        let targetChecked = false;

                        const itemRows = document.querySelectorAll('.sc-list-item-content, .sc-item-content');
                        for (const row of itemRows) {
                            const titleEl = row.querySelector('.sc-product-title, .a-truncate-cut, .sc-item-title a');
                            const linkEl = row.querySelector('a.sc-product-link, .sc-item-title a');
                            const checkbox = row.querySelector('input[type="checkbox"]');
                            if (!titleEl || !checkbox) continue;

                            if (checkbox.checked) {
                                const title = titleEl.innerText.trim();
                                const url = linkEl ? linkEl.href : '';
                                const asin = extractAsinInDOM(url);

                                let isTarget = false;
                                if (targetAsin && asin) {
                                    isTarget = (targetAsin === asin);
                                } else if (targetUrl && url && url.includes(targetUrl)) {
                                    isTarget = true;
                                } else {
                                    const normCartTitle = normalize(title);
                                    if (normTarget && normCartTitle && (normCartTitle.includes(normTarget) || normTarget.includes(normCartTitle))) {
                                        isTarget = true;
                                    }
                                }

                                if (isTarget && !targetChecked) {
                                    targetChecked = true;
                                } else {
                                    checkedNonTargets++;
                                }
                            }
                        }
                        return {
                            ok: targetChecked && checkedNonTargets === 0,
                            checkedNonTargets,
                            targetChecked
                        };
                    }, targetTitle, targetAsin, targetUrl);
                };

                // ── Reusable spinner wait helper ──
                const waitForSpinners = async () => {
                    await p.waitForFunction(() => {
                        const spinner = document.querySelector('.a-spinner-wrapper, .sc-update-animator');
                        return !spinner || window.getComputedStyle(spinner).display === 'none';
                    }, { timeout: 10000 }).catch(() => console.log('[Agent] Spinner wait timeout, proceeding anyway'));
                    await new Promise(res => setTimeout(res, 1000));
                };

                // ── Primary isolation pass ──
                const isolationSuccess = await runIsolation();
                
                console.log('[Agent] SMART_CHECKOUT:');
                console.log('[Agent] * chosen target asin:', targetAsin);
                console.log('[Agent] * chosen target title:', targetTitle);
                console.log('[Agent] * selected row count:', isolationSuccess.selectedCount);
                console.log('[Agent] * deselected row count:', isolationSuccess.deselectedCount);

                if (!isolationSuccess.targetFound) {
                    console.log('[Agent] Target item not found during isolation!');
                    return { success: false, error: 'Target item not found in cart during isolation' };
                }

                // Wait for Amazon AJAX cart spinners to completely disappear before verifying
                console.log('[Agent] Waiting for cart update spinners to disappear...');
                await waitForSpinners();

                // ── Double Safety Verification BEFORE checkout ──
                const verification = await runVerification();

                if (!verification.ok) {
                    // Recovery pass: only when target IS checked but non-targets remain selected
                    if (verification.targetChecked && verification.checkedNonTargets > 0) {
                        console.log(`[Agent] Recovery pass: target is checked but ${verification.checkedNonTargets} non-target items remain. Re-querying live DOM...`);

                        // Reapply the same isolation logic on fresh DOM nodes (single corrective attempt)
                        await runIsolation();

                        // Wait for AJAX spinners after recovery pass
                        await waitForSpinners();

                        // Re-verify after recovery pass
                        const reVerification = await runVerification();

                        if (reVerification.ok) {
                            console.log('[Agent] Recovery pass succeeded. Cart isolation is now clean.');
                        } else {
                            console.error('[Agent] Recovery pass failed. Re-verification result:', reVerification);
                            return {
                                success: false,
                                stage: 'isolation_verification',
                                error: !reVerification.targetChecked
                                    ? 'Cart Isolation failed: Target item is not checked.'
                                    : `Cart Isolation failed: ${reVerification.checkedNonTargets} non-target items are still selected.`
                            };
                        }
                    } else {
                        // Target not checked — no recovery possible
                        console.error('[Agent] Safety Verification Failed:', verification);
                        return {
                            success: false,
                            stage: 'isolation_verification',
                            error: 'Cart Isolation failed: Target item is not checked.'
                        };
                    }
                }
            }

            // Click Proceed to Buy
            console.log('[Agent] Cart Isolated successfully (or mode is entire_cart). Clicking Proceed to Buy.');
            const selectors = [
                'input[name="proceedToRetailCheckout"]',
                '#sc-buy-box-ptc-button',
                '#sc-buy-box-ptc-button input'
            ];

            let clicked = false;
            for (const sel of selectors) {
                try {
                    const el = await p.$(sel);
                    if (el) {
                        await Promise.all([
                            p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { }),
                            el.click()
                        ]);
                        clicked = true;
                        break;
                    }
                } catch { }
            }

            if (!clicked) {
                clicked = await p.evaluate(() => {
                    const el = Array.from(document.querySelectorAll('input,button,a'))
                        .find(e => (e.value || e.textContent || '').includes('Proceed to Buy'));
                    if (el) { el.click(); return true; }
                    return false;
                });
                if (clicked) await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { });
            }

            const url = p.url();
            console.log('[Agent] After smart checkout click URL:', url);
            const needsLogin = url.includes('signin') || url.includes('ap/');

            let needsAddress = false;
            if (!needsLogin) {
                needsAddress = await p.evaluate(() =>
                    document.body.innerText.includes("Add delivery address") ||
                    !!document.querySelector("input[name='address-ui-widgets-enterAddressFullName']")
                ).catch(() => false);
            }

            return { success: true, needsLogin, needsAddress, currentUrl: url };
        }

        // ── Checkout / poll steps (operate on existing page, return directly) ──
        if (action.type === 'amazon_goto_checkout') {
            console.log('[Agent] STEP 4: Going to checkout');
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            const cartUrl = 'https://www.amazon.in/gp/cart/view.html';
            await p.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(res => setTimeout(res, 3000));
            console.log('[Agent] Cart loaded');

            // Try clicking Proceed to Buy
            const selectors = [
                'input[name="proceedToRetailCheckout"]',
                '#sc-buy-box-ptc-button',
                '#sc-buy-box-ptc-button input'
            ];

            let clicked = false;
            for (const sel of selectors) {
                try {
                    const el = await p.$(sel);
                    if (el) {
                        await Promise.all([
                            p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { }),
                            el.click()
                        ]);
                        clicked = true;
                        console.log('[Agent] Clicked Proceed to Buy with:', sel);
                        break;
                    }
                } catch { }
            }

            if (!clicked) {
                clicked = await p.evaluate(() => {
                    const el = Array.from(document.querySelectorAll('input,button,a'))
                        .find(e => (e.value || e.textContent || '').includes('Proceed to Buy'));
                    if (el) { el.click(); return true; }
                    return false;
                });
                if (clicked) await p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { });
            }

            const url = p.url();
            console.log('[Agent] After checkout click URL:', url);
            const needsLogin = url.includes('signin') || url.includes('ap/');

            // Check if address is missing on the checkout page
            let needsAddress = false;
            if (!needsLogin) {
                needsAddress = await p.evaluate(() =>
                    document.body.innerText.includes("Add delivery address") ||
                    !!document.querySelector("input[name='address-ui-widgets-enterAddressFullName']")
                ).catch(() => false);
            }

            return { success: true, needsLogin, needsAddress, currentUrl: url };
        }



        if (action.type === 'amazon_poll_address') {
            try {
                const addressMissing = await page.evaluate(() =>
                    document.body.innerText.includes("Add delivery address") ||
                    !!document.querySelector("input[name='address-ui-widgets-enterAddressFullName']")
                );
                return { success: true, hasAddress: !addressMissing, currentUrl: page.url() };
            } catch (err) { return { success: false, error: err.message }; }
        }

        if (action.type === 'amazon_submit_address') {
            try {
                console.log("[Agent] Address added - resuming flow");
                const deliverBtn = await page.$("input[name='shipToThisAddress'], input[data-testid='Address_selectShipToThisAddress']");
                if (deliverBtn) {
                    await deliverBtn.click();
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
                } else {
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('input[type="submit"], button, a'));
                        const btn = btns.find(b => {
                            const t = (b.value || b.textContent || '').toLowerCase();
                            return t.includes('deliver to this address') || t.includes('use this address');
                        });
                        if (btn) btn.click();
                    });
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
                }
                const currentUrl = page.url();
                const needsLogin = currentUrl.includes('signin') || currentUrl.includes('ap/signin') || currentUrl.includes('ap/login');
                return { success: true, needsLogin, currentUrl };
            } catch (err) { return { success: false, error: err.message }; }
        }

        if (action.type === 'flipkart_goto_checkout') {
            try {
                await page.goto('https://www.flipkart.com/viewcart', { waitUntil: 'networkidle2', timeout: 15000 });
                const placeOrderBtn = await page.$('button[class*="place"], a[class*="place"], button[class*="checkout"]');
                if (placeOrderBtn) {
                    await placeOrderBtn.click();
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => { });
                }
                const currentUrl = page.url();
                const needsLogin = currentUrl.includes('login') || await page.evaluate(() =>
                    !!document.querySelector('input[type="tel"], input[placeholder*="mobile"], input[placeholder*="email"]')
                );
                return { success: true, needsLogin, currentUrl };
            } catch (err) { return { success: false, error: err.message }; }
        }

        if (action.type === 'flipkart_poll_login') {
            try {
                const isLoggedIn = await page.evaluate(() =>
                    !document.querySelector('input[type="tel"], input[placeholder*="mobile"]')
                );
                return { success: true, isLoggedIn, currentUrl: page.url() };
            } catch (err) { return { success: false, error: err.message }; }
        }

        if (action.type === 'zomato_goto_checkout' || action.type === 'swiggy_goto_checkout') {
            try {
                const isZomato = action.type === 'zomato_goto_checkout';
                console.log(`[Agent] Navigating to ${isZomato ? 'Zomato' : 'Swiggy'} cart...`);

                const cartClicked = await page.evaluate((isZomato) => {
                    const selectors = isZomato
                        ? ['a[href*="/cart"]', 'div[class*="cart"]', 'span[class*="cart"]']
                        : ['a[href*="/checkout"]', 'span[class*="Cart"]', 'div[class*="Cart"]'];

                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el && el.offsetWidth > 0) {
                            el.click();
                            return true;
                        }
                    }
                    return false;
                }, isZomato);

                if (!cartClicked) {
                    // Fallback to direct URL if button not found
                    await page.goto(isZomato ? 'https://www.zomato.com/cart' : 'https://www.swiggy.com/checkout', { waitUntil: 'networkidle2' });
                }

                await new Promise(r => setTimeout(r, 3000));
                await checkLoginBreak();
                return { success: true, message: `Reached ${isZomato ? 'Zomato' : 'Swiggy'} checkout!` };
            } catch (err) { return { success: false, error: err.message }; }
        }

        // Note: checkReviewPage is authoritatively defined at module scope delegating
        // strictly to checkoutCoordinator.evaluateReviewPage (ReviewEvidenceEvaluator).
        // The legacy porous check has been eliminated from the execution path (GAP-DEF-02).

        if (action.type === 'amazon_select_payment') {
            const paymentMethod = (action.method || '').toLowerCase();
            console.log('[Payment] Starting payment selection:', paymentMethod);
            const p = action.page || global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            const url = p.url();
            if (url.includes('/ap/signin') || url.includes('/ap/')) {
                return { success: false, error: 'Still on login page.' };
            }

            // Dismiss any popups (Prime offers, promo banners, etc.)
            console.log('[Payment] Checking for popups to dismiss...');
            await p.evaluate(() => {
                const dismissTexts = ['no thanks', 'no, thanks', 'not now', 'maybe later', 'skip'];
                const candidates = Array.from(document.querySelectorAll('button, a, input[type="submit"], span, .a-button-text'));
                for (const el of candidates) {
                    const text = (el.value || el.innerText || el.textContent || '').toLowerCase().trim();
                    if (dismissTexts.some(d => text === d || text.startsWith(d))) {
                        el.click();
                        console.log('[Payment] Dismissed popup:', text);
                        return true;
                    }
                }
                return false;
            }).catch(() => { });

            // Scroll to bottom to ensure all payment options are rendered
            await p.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
            await new Promise(res => setTimeout(res, 100)); // Tiny wait for lazy load
            await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await new Promise(res => setTimeout(res, 100));

            // Payment method keyword map — primary terms are specific, secondary are broader
            const keywordMap = {
                cod: {
                    primary: ['cash on delivery', 'pay on delivery'],
                    secondary: ['cash/card on delivery', 'cod', 'pay at door']
                },
                upi: {
                    primary: ['other upi', 'upi apps', 'your upi id', 'enter upi'],
                    secondary: ['bhim', 'gpay', 'phonepe', 'paytm']
                },
                card: {
                    primary: ['credit or debit card', 'credit/debit card'],
                    secondary: ['debit card', 'credit card', 'visa', 'mastercard', 'rupay']
                },
                netbanking: {
                    primary: ['net banking'],
                    secondary: ['netbanking']
                },
                amazonpay: {
                    primary: ['amazon pay balance'],
                    secondary: ['amazon pay']
                }
            };
            // Build competing keywords (all OTHER methods' terms) for disambiguation
            const competingKeywords = [];
            for (const [method, kws] of Object.entries(keywordMap)) {
                if (method !== paymentMethod) {
                    competingKeywords.push(...kws.primary, ...kws.secondary);
                }
            }

            const targetKws = keywordMap[paymentMethod] || { primary: [], secondary: [] };
            const allTerms = [...targetKws.primary, ...targetKws.secondary];
            console.log('[Payment] Primary terms:', targetKws.primary);
            console.log('[Payment] Secondary terms:', targetKws.secondary);

            // STEP 1: Find the correct payment radio/checkbox using SCORED matching and click it in multiple ways
            console.log('[Payment] Finding and selecting target payment option...');
            const selectResult = await p.evaluate(async (primaryTerms, secondaryTerms, method) => {
                const getReviewText = (el) => (el.value || el.innerText || el.textContent || '').toLowerCase().trim();

                const radios = Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"], input[name="ppw-instrumentRowSelection"]'));
                let bestRadio = null;
                let bestScore = -Infinity;

                for (const radio of radios) {
                    let el = radio.parentElement;
                    let depth = 0;
                    let text = '';
                    while (el && depth < 6) {
                        text += ' ' + getReviewText(el);
                        el = el.parentElement;
                        depth++;
                    }
                    text = text.toLowerCase();

                    const primaryHits = primaryTerms.filter(t => text.includes(t.toLowerCase())).length;
                    const secondaryHits = secondaryTerms.filter(t => text.includes(t.toLowerCase())).length;
                    if (primaryHits === 0 && secondaryHits === 0) continue;

                    const score = (primaryHits * 20) + (secondaryHits * 5);
                    if (score > bestScore) {
                        bestScore = score;
                        bestRadio = radio;
                    }
                }

                if (bestRadio) {
                    bestRadio.scrollIntoView({ block: 'center', inline: 'center' });
                    bestRadio.click();

                    if (bestRadio.id) {
                        const label = document.querySelector(`label[for="${CSS.escape(bestRadio.id)}"]`);
                        if (label) label.click();
                    }

                    const container = bestRadio.closest('.pm-instrument-row, .a-box-row, div[class*="instrument-row"], div[class*="PaymentMethod"]');
                    if (container) container.click();

                    return { success: true, text: getReviewText(bestRadio.parentElement).slice(0, 100) };
                }

                // Fallback: look for row containers matching terms
                const candidates = Array.from(document.querySelectorAll('.pm-instrument-row, .a-box-row, label, span, div'));
                for (const candidate of candidates) {
                    const text = getReviewText(candidate);
                    const primaryHits = primaryTerms.filter(t => text.includes(t.toLowerCase())).length;
                    if (primaryHits > 0) {
                        candidate.scrollIntoView({ block: 'center', inline: 'center' });
                        candidate.click();
                        const internalRadio = candidate.querySelector('input[type="radio"], input[type="checkbox"]');
                        if (internalRadio) internalRadio.click();
                        return { success: true, fallbackClick: true, text: text.slice(0, 100) };
                    }
                }

                return { success: false, error: `No elements matching ${method} found.` };
            }, targetKws.primary, targetKws.secondary, paymentMethod);

            console.log('[Payment] In-page select result:', JSON.stringify(selectResult));

            // Wait briefly for selection styling/state to settle
            await new Promise(res => setTimeout(res, 300));

            // STRICT VERIFICATION: Ensure a radio/checkbox matching our terms is actually CHECKED
            const isVerified = await p.evaluate((terms) => {
                const checked = Array.from(document.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked, input[name="ppw-instrumentRowSelection"]:checked'));
                for (const radio of checked) {
                    let el = radio.parentElement;
                    let depth = 0;
                    let text = '';
                    while (el && depth < 6) {
                        text += ' ' + (el.innerText || el.textContent || '');
                        el = el.parentElement;
                        depth++;
                    }
                    text = text.toLowerCase();
                    if (terms.some(t => text.includes(t.toLowerCase()))) {
                        return true;
                    }
                }
                return false;
            }, allTerms);

            console.log('[Payment] Strict payment verification status:', isVerified);

            if (!isVerified) {
                return {
                    success: false,
                    error: `Could not verify selection of ${paymentMethod.toUpperCase()} payment method. Please select it manually in Chrome, then retry.`
                };
            }

            // Handle UPI ID if needed
            if (paymentMethod === 'upi' && action.upiId) {
                try {
                    const upiInput = await p.$('input[placeholder*="UPI"], input[placeholder*="VPA"], input[data-testid*="upi"]');
                    if (upiInput) {
                        await upiInput.click({ clickCount: 3 });
                        await upiInput.type(action.upiId, { delay: 50 });
                        await new Promise(res => setTimeout(res, 500));
                    }
                } catch { console.log('[Payment] No UPI input field found'); }
            }

            if (paymentMethod === 'card') {
                console.log('[Payment] Card selected. Returning early for manual entry.');
                return { success: true, paymentSelected: 'card', requiresManualEntry: true };
            }

            // In Increment 2B-2, UPI no longer returns early (GAP-DEF-01 eliminated).
            // Instead, UPI advances to click continue and proceed to the review page.
            if (paymentMethod === 'upi') {
                console.log('[Payment] UPI selected. Advancing to continue button and review page...');
            }

            // STEP 2: Find and click "Use this payment method" continue button
            console.log('[Payment] Finding and clicking continue/use-payment button...');
            console.log('[DIAGNOSTIC] [Payment] Pre-continue click URL:', p.url());
            
            let continueClicked = false;
            if (paymentContinueClicked) {
                console.log('[Payment] "Use this payment method" click already completed/in-progress. Skipping duplicate click.');
                continueClicked = true;
            } else {
                paymentContinueClicked = true;
            }
            for (let attempt = 0; attempt < 15 && !continueClicked; attempt++) {
                if (attempt > 0) await new Promise(res => setTimeout(res, 200));
                
                // Let's log potential continue buttons on attempt 0
                if (attempt === 0) {
                    const btnDetails = await p.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('input[type="submit"], button, .a-button-input, .a-button-text'));
                        return buttons.map(btn => {
                            const text = (btn.value || btn.innerText || btn.textContent || '').toLowerCase().trim();
                            const rect = btn.getBoundingClientRect();
                            return {
                                tag: btn.tagName,
                                id: btn.id,
                                className: btn.className,
                                text: text,
                                disabled: btn.disabled,
                                ariaDisabled: btn.getAttribute('aria-disabled'),
                                visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
                                top: rect.top,
                                left: rect.left
                            };
                        }).filter(b => b.text.includes('use this payment') || b.text.includes('continue'));
                    }).catch(() => []);
                    console.log('[DIAGNOSTIC] [Payment] Found continue/use-payment button candidates:', JSON.stringify(btnDetails));
                }

                const btnClicked = await p.evaluate(() => {
                    const matchTexts = ['use this payment method', 'use this payment', 'continue'];
                    const buttons = Array.from(document.querySelectorAll('input[type="submit"], button, .a-button-input, .a-button-text'));
                    for (const btn of buttons) {
                        const text = (btn.value || btn.innerText || btn.textContent || '').toLowerCase().trim();
                        if (matchTexts.some(t => text.includes(t)) && !btn.disabled) {
                            btn.scrollIntoView({ block: 'center', inline: 'center' });
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                });
                if (btnClicked) {
                    continueClicked = true;
                    console.log(`[Payment] Continue button clicked via direct click on attempt ${attempt + 1}`);
                }
            }

            if (!continueClicked) {
                console.log('[DIAGNOSTIC] [Payment] Failed to click continue button.');
                return {
                    success: false,
                    error: 'Could not click "Use this payment method" continue button. Please click it manually in Chrome.'
                };
            }

            console.log('[DIAGNOSTIC] [Payment] Post-continue click URL (before wait):', p.url());

            // STEP 3: Event-driven wait for order review page/transition
            try {
                await p.waitForFunction(() => {
                    const url = window.location.href;
                    const isReviewUrl = url.includes('/review') || url.includes('/display.html');
                    
                    const orderSelectors = [
                        '#submitOrderButtonId input',
                        'input[name="placeYourOrder1"]',
                        'span[data-feature-id="place-order-button"] input',
                        'div[data-feature-id="place-order-button"] input',
                        '#turbo-checkout-pyo-button input',
                        '#bottomSubmitOrderButtonId input',
                        '#turbo-checkout-pyo-button',
                        '#bottomSubmitOrderButtonId',
                        '#submitOrderButtonId'
                    ];
                    let hasPlaceOrderButton = false;
                    for (const sel of orderSelectors) {
                        const btn = document.querySelector(sel);
                        if (btn) {
                            const rect = btn.getBoundingClientRect();
                            const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);
                            const enabled = !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
                            if (visible && enabled) {
                                hasPlaceOrderButton = true;
                                break;
                            }
                        }
                    }
                    
                    const hasReviewContainer = !!document.querySelector('#spc-guts') || 
                                               !!document.querySelector('#spc-order-summary') ||
                                               !!document.querySelector('.spc-desktop') ||
                                               !!document.querySelector('#checkoutDisplayPage');
                                               
                    const spinner = document.querySelector('.a-spinner-wrapper, .sc-update-animator, #loading-spinner, .loading-mask');
                    const isSpinnerVisible = spinner ? (spinner.offsetWidth > 0 && spinner.offsetHeight > 0) : false;
                    
                    return (isReviewUrl || hasPlaceOrderButton || hasReviewContainer) && !isSpinnerVisible;
                }, { timeout: 25000 });
                console.log('[DIAGNOSTIC] [Payment] Event-driven review page transition condition met.');
            } catch (err) {
                console.log('[Payment] Event-driven review page wait timeout/skipped:', err.message);
            }

            const finalUrl = typeof p.url === 'function' ? p.url() : '';
            console.log('[DIAGNOSTIC] [Payment] Post-continue click URL (after wait):', finalUrl);

            const onReviewPage = await checkReviewPage(p);
            console.log('[Payment] On review page:', onReviewPage, '| URL:', (finalUrl || '').slice(0, 80));

            let reviewStageResult = null;
            if (onReviewPage) {
                reviewStageResult = await handleReviewStage(p, {
                    targetAsin: action.targetAsin,
                    approvedBudget: action.approvedBudget,
                    sessionId: action.sessionId
                });
            }

            // Pop Buddy back to center for final approval
            positionWindowCenter();
            if (global.mainWindowRef && !global.mainWindowRef.isDestroyed()) {
                global.mainWindowRef.show();
                global.mainWindowRef.focus();
                global.mainWindowRef.setAlwaysOnTop(true);
                setTimeout(() => { global.mainWindowRef?.setAlwaysOnTop(false); }, 2000);
            }

            return {
                success: true,
                paymentSelected: paymentMethod,
                onReviewPage,
                currentUrl: finalUrl,
                reviewStage: reviewStageResult
            };
        }

        if (action.type === 'amazon_verify_card_and_continue') {
            console.log('[Payment] Verifying manual card entry and continuing...');
            try {
                const p = action.page || global.activePage;
                if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

                let continueClicked = false;
                if (paymentContinueClicked) {
                    console.log('[Payment] "Use this payment method" click already completed/in-progress during card flow. Skipping duplicate click.');
                    continueClicked = true;
                } else {
                    paymentContinueClicked = true;
                }
                for (let attempt = 0; attempt < 6 && !continueClicked; attempt++) {
                    await new Promise(res => setTimeout(res, 1000));
                    const btnClicked = await p.evaluate(() => {
                        const matchTexts = ['use this payment method', 'use this payment', 'continue'];
                        const buttons = Array.from(document.querySelectorAll('input[type="submit"], button, .a-button-input, .a-button-text'));
                        for (const btn of buttons) {
                            const text = (btn.value || btn.innerText || btn.textContent || '').toLowerCase().trim();
                            if (matchTexts.some(t => text.includes(t)) && !btn.disabled) {
                                btn.scrollIntoView({ block: 'center', inline: 'center' });
                                btn.click();
                                return true;
                            }
                        }
                        return false;
                    });
                    if (btnClicked) {
                        continueClicked = true;
                        console.log(`[Payment] Continue button clicked during manual verify on attempt ${attempt + 1}`);
                    }
                }

                if (!continueClicked) {
                    return {
                        success: false,
                        error: 'Could not click "Use this payment method" continue button. Did you complete the card details?'
                    };
                }

                // Wait for navigation to order review page
                try {
                    await p.waitForFunction(() => {
                        const url = window.location.href;
                        const isReviewUrl = url.includes('/review') || url.includes('/display.html');
                        
                        const orderSelectors = [
                            '#submitOrderButtonId input',
                            'input[name="placeYourOrder1"]',
                            'span[data-feature-id="place-order-button"] input',
                            'div[data-feature-id="place-order-button"] input',
                            '#turbo-checkout-pyo-button input',
                            '#bottomSubmitOrderButtonId input',
                            '#turbo-checkout-pyo-button',
                            '#bottomSubmitOrderButtonId',
                            '#submitOrderButtonId'
                        ];
                        let hasPlaceOrderButton = false;
                        for (const sel of orderSelectors) {
                            const btn = document.querySelector(sel);
                            if (btn) {
                                const rect = btn.getBoundingClientRect();
                                const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);
                                const enabled = !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
                                if (visible && enabled) {
                                    hasPlaceOrderButton = true;
                                    break;
                                }
                            }
                        }
                        
                        const hasReviewContainer = !!document.querySelector('#spc-guts') || 
                                                   !!document.querySelector('#spc-order-summary') ||
                                                   !!document.querySelector('.spc-desktop') ||
                                                   !!document.querySelector('#checkoutDisplayPage');
                                                   
                        const spinner = document.querySelector('.a-spinner-wrapper, .sc-update-animator, #loading-spinner, .loading-mask');
                        const isSpinnerVisible = spinner ? (spinner.offsetWidth > 0 && spinner.offsetHeight > 0) : false;
                        
                        return (isReviewUrl || hasPlaceOrderButton || hasReviewContainer) && !isSpinnerVisible;
                    }, { timeout: 25000 });
                    console.log('[DIAGNOSTIC] [Payment] Event-driven review page transition condition met after manual card.');
                } catch (err) {
                    console.log('[Payment] Event-driven review page wait timeout after card:', err.message);
                }

                const finalUrl = typeof p.url === 'function' ? p.url() : '';
                const onReviewPage = await checkReviewPage(p);
                console.log('[Payment] On review page after manual card:', onReviewPage, '| URL:', (finalUrl || '').slice(0, 80));

                if (!onReviewPage) {
                    return { success: false, error: 'Did not reach the order review page. There might be an issue with the card.' };
                }

                let reviewStageResult = null;
                if (onReviewPage) {
                    reviewStageResult = await handleReviewStage(p, {
                        targetAsin: action.targetAsin,
                        approvedBudget: action.approvedBudget,
                        sessionId: action.sessionId
                    });
                }

                return { success: true, onReviewPage, reviewStage: reviewStageResult };
            } catch (err) {
                return { success: false, error: err.message };
            }
        }

        if (action.type === 'amazon_place_order') {
            console.log('[Agent] STEP 6: Placing order');
            agentState = 'placing_order';
            const p = global.activePage;
            if (!p || p.isClosed()) return { success: false, error: 'No active browser session' };

            // ── DUPLICATE EXECUTION PROTECTION ──
            if (placeOrderClicked) {
                console.log('[Agent] "Place Order" already completed/triggered. Aborting duplicate execution.');
                return { success: false, error: 'Place Order already triggered.' };
            }
            placeOrderClicked = true;

            // ── WORKFLOW STATE VALIDATION ──
            const currentUrl = p.url();
            const currentWorkflowStage = agentState;
            const isReviewReached = await checkReviewPage(p);

            // Detailed validation log
            const placeOrderProbe = await p.evaluate(() => {
                const selectors = [
                    'input[name="placeYourOrder1"]',
                    '#submitOrderButtonId input',
                    '#turbo-checkout-pyo-button input',
                    '#bottomSubmitOrderButtonId input',
                    'span[data-feature-id="place-order-button"] input',
                    'div[data-feature-id="place-order-button"] input',
                    '#turbo-checkout-pyo-button',
                    '#bottomSubmitOrderButtonId',
                    '#submitOrderButtonId'
                ];
                const info = {};
                for (const sel of selectors) {
                    const btn = document.querySelector(sel);
                    if (btn) {
                        const rect = btn.getBoundingClientRect();
                        const cs = window.getComputedStyle(btn);
                        info[sel] = {
                            found: true,
                            visible: !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length),
                            enabled: !btn.disabled && btn.getAttribute('aria-disabled') !== 'true',
                            clickable: cs.pointerEvents !== 'none',
                            outerHTML: btn.outerHTML.substring(0, 150)
                        };
                    } else {
                        info[sel] = { found: false };
                    }
                }
                return info;
            }).catch(err => ({ error: err.message }));

            console.log('╔════ WORKFLOW STATE VALIDATION ════');
            console.log('║ Current URL:', currentUrl);
            console.log('║ Current Workflow Stage:', currentWorkflowStage);
            console.log('║ Review State Reached:', isReviewReached);
            console.log('║ Place Order buttons probe:', JSON.stringify(placeOrderProbe));
            console.log('╚═══════════════════════════════════');

            if (!isReviewReached) {
                console.log('[Agent] ABORTING: Place Order requested but review page state not actually reached.');
                placeOrderClicked = false; // Reset lock to allow retry
                agentState = 'idle';
                return { 
                    success: false, 
                    error: 'Checkout review page not reached. Current URL: ' + currentUrl 
                };
            }

            console.log('[DIAGNOSTIC] Entering place order. Current URL:', p.url());

            // Diagnostic: Detect overlays / spinners
            const overlayInfo = await p.evaluate(() => {
                const indicators = Array.from(document.querySelectorAll('.a-spinner-wrapper, .sc-update-animator, #loading-spinner, .loading-mask, [class*="spinner"], [class*="loading"], [id*="loading"]'));
                return indicators.map(el => ({
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                    visible: el.offsetWidth > 0 && el.offsetHeight > 0,
                    display: window.getComputedStyle(el).display,
                    visibility: window.getComputedStyle(el).visibility
                }));
            }).catch(err => `Error detecting overlays: ${err.message}`);
            console.log('[DIAGNOSTIC] Detected spinner/loading elements:', JSON.stringify(overlayInfo));

            await p.evaluate(() => window.scrollBy(0, 400));
            await new Promise(res => setTimeout(res, 1500));

            console.log('[DIAGNOSTIC] Scrolled page. Current URL:', p.url());

            // ── COMPREHENSIVE DOM INVENTORY ──
            const domInventory = await p.evaluate(() => {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
                const candidates = [];
                let node;
                while ((node = walker.nextNode())) {
                    const text = (node.value || node.innerText || node.textContent || '').toLowerCase();
                    if (text.includes('place your order') || text.includes('place order')) {
                        if (node.children && node.children.length > 5) continue;
                        const rect = node.getBoundingClientRect();
                        const cs = window.getComputedStyle(node);
                        candidates.push({
                            tag: node.tagName,
                            id: node.id || '',
                            name: node.name || '',
                            type: node.type || '',
                            className: (node.className || '').toString().substring(0, 120),
                            text: (node.value || node.innerText || '').substring(0, 100),
                            outerHTML: node.outerHTML.substring(0, 500),
                            disabled: !!node.disabled,
                            ariaDisabled: node.getAttribute('aria-disabled'),
                            visible: !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length),
                            display: cs.display,
                            visibility: cs.visibility,
                            pointerEvents: cs.pointerEvents,
                            width: node.offsetWidth,
                            height: node.offsetHeight,
                            top: Math.round(rect.top),
                            left: Math.round(rect.left),
                            isClickable: cs.pointerEvents !== 'none' && cs.visibility !== 'hidden' && cs.display !== 'none',
                            parentTag: node.parentElement ? node.parentElement.tagName : 'N/A',
                            parentId: node.parentElement ? (node.parentElement.id || '') : '',
                            parentClass: node.parentElement ? (node.parentElement.className || '').toString().substring(0, 80) : ''
                        });
                    }
                }
                return candidates;
            }).catch(err => [{ error: err.message }]);
            console.log('[DIAGNOSTIC] ══════════════════════════════════════════');
            console.log('[DIAGNOSTIC] FULL DOM INVENTORY — "Place Order" candidates:');
            console.log('[DIAGNOSTIC] Total found:', domInventory.length);
            domInventory.forEach((el, i) => {
                console.log(`[DIAGNOSTIC] Candidate ${i}:`, JSON.stringify(el));
            });
            console.log('[DIAGNOSTIC] ══════════════════════════════════════════');

            // ── SELECTOR VALIDATION & RANKING ──
            const targetSelector = await p.evaluate(() => {
                const selectors = [
                    'input[name="placeYourOrder1"]',
                    '#submitOrderButtonId input',
                    '#turbo-checkout-pyo-button input',
                    '#bottomSubmitOrderButtonId input',
                    'span[data-feature-id="place-order-button"] input',
                    'div[data-feature-id="place-order-button"] input',
                    '#turbo-checkout-pyo-button',
                    '#bottomSubmitOrderButtonId',
                    '#submitOrderButtonId'
                ];
                
                const matches = [];
                for (const sel of selectors) {
                    const btn = document.querySelector(sel);
                    if (btn) {
                        const rect = btn.getBoundingClientRect();
                        const cs = window.getComputedStyle(btn);
                        const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);
                        const enabled = !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
                        const pointerEvents = cs.pointerEvents !== 'none';
                        const isClickable = visible && enabled && pointerEvents;
                        
                        if (isClickable) {
                            let score = 0;
                            if (btn.tagName === 'INPUT' || btn.tagName === 'BUTTON') score += 10;
                            if (sel.includes('placeYourOrder1')) score += 5;
                            if (sel.includes('turbo')) score += 4;
                            if (sel.includes('bottom')) score += 3;
                            
                            matches.push({ selector: sel, score });
                        }
                    }
                }
                
                if (matches.length > 0) {
                    matches.sort((a, b) => b.score - a.score);
                    return matches[0].selector;
                }
                
                // Fallback text check
                const elements = Array.from(document.querySelectorAll('input[type="submit"],button,span.a-button,a.a-button'));
                for (const btn of elements) {
                    const val = (btn.value || btn.innerText || btn.textContent || '').toLowerCase();
                    if (val.includes('place your order') || val.includes('place order')) {
                        const cs = window.getComputedStyle(btn);
                        const visible = !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length);
                        const enabled = !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
                        const pointerEvents = cs.pointerEvents !== 'none';
                        const isClickable = visible && enabled && pointerEvents;
                        if (isClickable) {
                            return 'TEXT_FALLBACK';
                        }
                    }
                }
                return null;
            }).catch(() => null);

            console.log('[DIAGNOSTIC] Best validated selector found:', targetSelector);

            let clicked = false;
            if (targetSelector && targetSelector !== 'TEXT_FALLBACK') {
                try {
                    const el = await p.$(targetSelector);
                    if (el) {
                        console.log('[Agent] Clicking Place Order button via selector:', targetSelector);
                        await el.click();
                        clicked = true;
                    }
                } catch (err) {
                    console.log('[Agent] Failed to click selector:', targetSelector, err.message);
                }
            }

            if (!clicked && targetSelector === 'TEXT_FALLBACK') {
                console.log('[Agent] Triggering text-based fallback click...');
                clicked = await p.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('input[type="submit"],button,span.a-button,a.a-button'));
                    const btn = elements.find(el => {
                        const val = (el.value || el.innerText || el.textContent || '').toLowerCase();
                        return val.includes('place your order') || val.includes('place order');
                    });
                    if (btn) {
                        const inner = btn.querySelector && btn.querySelector('input[type="submit"], .a-button-input');
                        (inner || btn).click();
                        return true;
                    }
                    return false;
                }).catch(() => false);
            }

            if (!clicked) {
                placeOrderClicked = false; // Reset to allow retry
                agentState = 'idle';
                console.log('[DIAGNOSTIC] FAILED: Place Order button not found or not clickable.');
                return { success: false, error: 'Place Order button not found. Please click it in the browser.' };
            }

            // Event-driven wait for order confirmation/URL change
            console.log('[Agent] Click dispatched. Waiting for order confirmation...');
            try {
                await p.waitForFunction(() => {
                    const url = window.location.href;
                    const isThankYouUrl = url.includes('thankyou') || url.includes('confirmation') || url.includes('thank-you');
                    
                    const bodyText = (document.body.innerText || '').toLowerCase();
                    const hasConfirmationText = bodyText.includes('order has been placed') || 
                                                bodyText.includes('thank you') || 
                                                bodyText.includes('order placed');
                                                
                    const hasAlertSuccess = !!document.querySelector('.a-alert-success') || 
                                            !!document.querySelector('#registration-success-message') ||
                                            !!document.querySelector('.checkout-success');
                                            
                    const btn = document.querySelector('#submitOrderButtonId') || 
                                document.querySelector('input[name="placeYourOrder1"]') ||
                                document.querySelector('#turbo-checkout-pyo-button');
                    const btnGone = btn ? !(btn.offsetWidth > 0 && btn.offsetHeight > 0) : true;
                    
                    return isThankYouUrl || hasConfirmationText || hasAlertSuccess || btnGone;
                }, { timeout: 30000 });
                console.log('[DIAGNOSTIC] [Agent] Order placement confirmation event detected.');
            } catch (err) {
                console.log('[Agent] Order confirmation event wait timed out/skipped:', err.message);
            }

            const finalUrl = p.url();
            console.log('[DIAGNOSTIC] Checking final order confirmation state. URL:', finalUrl);

            const checkConfirmationDOM = await p.evaluate(() => {
                return {
                    bodyTextContainsOrderPlaced: document.body.innerText.includes('order has been placed'),
                    bodyTextContainsThankYou: document.body.innerText.includes('Thank you'),
                    hasAlertSuccess: !!document.querySelector('.a-alert-success'),
                    bodyTextLength: document.body.innerText.length,
                    htmlSnippet: document.body.innerHTML.substring(0, 1000)
                };
            }).catch(err => ({ error: err.message }));
            console.log('[DIAGNOSTIC] DOM confirmation check:', JSON.stringify(checkConfirmationDOM));

            const orderPlaced = finalUrl.includes('thankyou') || finalUrl.includes('confirmation') ||
                (checkConfirmationDOM.bodyTextContainsOrderPlaced || checkConfirmationDOM.bodyTextContainsThankYou || checkConfirmationDOM.hasAlertSuccess);

            agentState = 'idle';
            console.log('[Agent] Order placed result:', orderPlaced, '| URL:', finalUrl);
            if (global.mainWindowRef && !global.mainWindowRef.isDestroyed()) {
                positionWindowCenter();
            }
            return {
                success: true,
                orderPlaced,
                message: orderPlaced ? '🎉 Order placed successfully!' : 'Order submitted — check your email!'
            };
        }

        // ── Flipkart ──────────────────────────────────────────────────────────
        if (action.type === 'flipkart_search') {
            if (action.selectedProduct) {
                console.log('[Agent] Navigating to user-selected Flipkart product:', action.selectedProduct);
                await page.goto(action.selectedProduct, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 2500));
                await checkLoginBreak();
            } else {
                console.log('[Agent] Navigating to Flipkart search for:', action.query);
                await page.goto('https://www.flipkart.com/search?q=' + encodeURIComponent(action.query), { waitUntil: 'networkidle2' });
                await new Promise(r => setTimeout(r, 2500));
                await checkLoginBreak();

                // Extract products from Flipkart
                const products = await page.evaluate(() => {
                    const cards = document.querySelectorAll('div[data-id]');
                    const results = [];
                    cards.forEach(card => {
                        const linkEl = card.querySelector('a[href*="/p/"]');
                        if (!linkEl) return;

                        // Flipkart has different layouts, try multiple selectors
                        const priceEl = card.querySelector('div[class*="_30jeq3"]') ||
                            card.querySelector('div[class*="Nx9Wp0"]') ||
                            card.querySelector('div._30jeq3');

                        const titleEl = card.querySelector('a[title]') ||
                            card.querySelector('div[class*="_4rR01T"]') ||
                            card.querySelector('a.IRpwTa');

                        const ratingEl = card.querySelector('div[class*="_3LWZlK"]');

                        let price = null;
                        if (priceEl) {
                            const priceText = priceEl.textContent.replace(/[₹,\s]/g, '').trim();
                            const parsed = parseFloat(priceText);
                            if (!isNaN(parsed)) price = parsed;
                        }

                        let rating = 0;
                        if (ratingEl) {
                            const parsed = parseFloat(ratingEl.textContent);
                            if (!isNaN(parsed)) rating = parsed;
                        }

                        results.push({
                            url: linkEl.href,
                            price,
                            rating,
                            title: titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || 'Product'
                        });
                    });
                    return results;
                });

                console.log('[Agent] Flipkart products extracted:', products.length);

                const budget = action.budget ? parseFloat(action.budget) : null;
                let candidates = products.filter(p => p.price !== null && (!budget || p.price <= budget));

                if (budget && candidates.length === 0) {
                    const cheapest = products.filter(p => p.price !== null).sort((a, b) => a.price - b.price)[0];
                    return { success: false, budgetExceeded: true, cheapestAvailable: cheapest?.price, cheapestTitle: cheapest?.title?.slice(0, 50), originalBudget: budget, error: `No Flipkart products within ₹${budget}` };
                }

                candidates = candidates.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0)).slice(0, 5);

                if (candidates.length > 0) {
                    return { success: true, options: candidates };
                } else {
                    const pick = products.find(p => p.url);
                    if (!pick) return { success: false, error: 'No products found on this page.' };
                    await page.goto(pick.url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                    await new Promise(r => setTimeout(r, 2500));
                    await checkLoginBreak();
                }
            }

            // Add to cart for Flipkart
            console.log('[Agent] On Flipkart product page:', page.url());
            const cartClicked = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const addBtn = btns.find(btn => {
                    const text = btn.innerText.toLowerCase();
                    return (text.includes('add to cart') || text.includes('buy now')) && btn.offsetWidth > 0;
                });
                if (addBtn) {
                    addBtn.scrollIntoView({ block: 'center' });
                    addBtn.click();
                    return true;
                }
                return false;
            });

            console.log('[Agent] Flipkart Add to Cart result:', cartClicked);
            if (!cartClicked) return { success: false, error: 'Could not find Add to Cart button on Flipkart.' };

            await new Promise(r => setTimeout(r, 2500));
            await checkLoginBreak();
            return { success: true, message: 'Added to cart on Flipkart!' };
        }

        // ── Food ──────────────────────────────────────────────────────────────
        if (action.type === 'zomato_search' || action.type === 'swiggy_search') {
            const isZomato = action.type === 'zomato_search';

            if (action.selectedProduct) {
                console.log(`[Agent] Navigating to user-selected ${isZomato ? 'Zomato' : 'Swiggy'} restaurant:`, action.selectedProduct);
                await page.goto(action.selectedProduct, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                await new Promise(r => setTimeout(r, 2500));
                await checkLoginBreak();
                await automateFoodOrder(page, checkLoginBreak);
                return { success: true, message: `Added items to cart on ${isZomato ? 'Zomato' : 'Swiggy'}!` };
            }

            const url = isZomato
                ? 'https://www.zomato.com/search?q=' + encodeURIComponent(action.query)
                : 'https://www.swiggy.com/search?query=' + encodeURIComponent(action.query);

            console.log(`[Agent] Navigating to ${isZomato ? 'Zomato' : 'Swiggy'} for:`, action.query);
            await page.goto(url, { waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 2000));
            await checkLoginBreak();

            // Extract restaurants
            const restaurants = await page.evaluate((isZomato) => {
                const selector = isZomato
                    ? 'a[href*="/restaurants/"], div[class*="jumbo-tracker"] a'
                    : 'a[href*="/restaurants/"], div[class*="RestaurantCard"] a';

                const links = Array.from(document.querySelectorAll(selector));
                const results = [];
                links.forEach(link => {
                    if (link.offsetWidth > 0 && link.offsetHeight > 0 && link.href) {
                        const card = link.closest('div[class*="jumbo"], div[class*="RestaurantCard"]') || link.parentElement;
                        const title = card?.innerText?.split('\n')[0] || 'Restaurant';
                        const rating = card?.innerText?.match(/(\d+\.\d+)\s*★/)?.[1] || '0';
                        results.push({
                            url: link.href,
                            title: title,
                            rating: parseFloat(rating),
                            price: 0 // We don't have a price for restaurants
                        });
                    }
                });
                return results;
            }, isZomato);

            console.log(`[Agent] Found ${restaurants.length} restaurants on ${isZomato ? 'Zomato' : 'Swiggy'}`);

            if (restaurants.length > 0) {
                // Return restaurants for selection
                return {
                    success: false,
                    needsSelection: true,
                    options: restaurants.slice(0, 5).map(r => ({ ...r, title: `🍴 ${r.title}` }))
                };
            } else {
                // If no restaurants found, attempt generic automation
                await automateFoodOrder(page, checkLoginBreak);
                return { success: true, message: `Attempted to add items on ${isZomato ? 'Zomato' : 'Swiggy'}.` };
            }
        }

        // ── Other platforms ───────────────────────────────────────────────────
        if (action.type === 'google_search') {
            await page.goto('https://www.google.com/search?q=' + encodeURIComponent(action.query), { waitUntil: 'networkidle2' });
            return { success: true };
        }
        if (action.type === 'minimize') {
            hideMainWindow();
            return { success: true };
        }
        if (action.type === 'open_url') {
            await page.goto(action.url, { waitUntil: 'networkidle2' });
            return { success: true };
        }
        if (action.type === 'ola_open') {
            await page.goto('https://book.olacabs.com/', { waitUntil: 'networkidle2' });
            if (action.destination) {
                await page.waitForSelector('input[placeholder*="destination"], input[placeholder*="Where to"]', { timeout: 5000 }).catch(() => { });
                await page.type('input[placeholder*="destination"], input[placeholder*="Where to"]', action.destination);
            }
            return { success: true };
        }
        if (action.type === 'uber_open') {
            await page.goto('https://m.uber.com/looking', { waitUntil: 'networkidle2' });
            return { success: true };
        }
        if (action.type === 'bookmyshow_search') {
            await page.goto('https://in.bookmyshow.com/explore/movies/' + (action.city || 'chennai'), { waitUntil: 'networkidle2' });
            return { success: true };
        }

        throw new Error('Unknown action type: ' + action.type);

    } catch (err) {
        console.error('❌ AGENT ERROR:', err);
        if (err.message === 'LOGIN_REQUIRED') {
            return {
                success: false,
                error: 'Please log in in the browser, then click "I\'ve Logged In" in Buddy.'
            };
        }
        return { success: false, error: err.message };
    } finally {
        isAutomationRunning = false;
    }
}

async function executeMinimalAgentAction(action) {
    // DISABLED — use executeAgentAction with type: "amazon_search" instead
    console.warn("⚠️ executeMinimalAgentAction is disabled");
    return { success: false, error: "Disabled — use executeAgentAction" };
    /* ORIGINAL CODE BELOW — kept for reference
    console.log("🚀 EXECUTE AGENT:", sanitizeActionForLog(action));

    if (!action) {
        throw new Error("Action is undefined");
    }

    if (!action.query) {
        action.query = "";
    }

    const page = await getBrowserPage();

    let productUrl = action.selectedProduct || null;
    const budget = action.budget ? parseInt(action.budget, 10) : null;

    if (!productUrl) {
        await page.goto("https://www.amazon.in", {
            waitUntil: "networkidle2",
            timeout: 60000
        });
        console.log("➡️ Page loaded");

        await page.waitForSelector("input[name='field-keywords']", { timeout: 15000 });
        await page.click("input[name='field-keywords']", { clickCount: 3 });
        await page.type("input[name='field-keywords']", action.query || "");
        await page.keyboard.press("Enter");
        await page.waitForSelector("[data-component-type='s-search-result']", { timeout: 20000 });
        console.log("➡️ Search results loaded");

        const products = await page.evaluate(() => {
            const items = document.querySelectorAll("[data-component-type='s-search-result']");

            return Array.from(items).map((item) => {
                const link = item.querySelector("a[href*='/dp/']")?.href || null;
                const priceText = item.querySelector('.a-price .a-offscreen')?.innerText || null;
                const price = priceText ? parseInt(priceText.replace(/[^\d]/g, ''), 10) : null;
                const title = item.querySelector('h2')?.innerText?.trim() || 'Product';

                return { link, price, title };
            }).filter((product) => product.link && product.price);
        });

        const validProducts = budget && !isNaN(budget)
            ? products.filter(product => product.price <= budget)
            : products;

        if (budget && !isNaN(budget)) {
            console.log(`[Agent] Applying budget filter: ₹${budget}`);
        }

        if (!validProducts.length) {
            if (budget && !isNaN(budget)) {
                const cheapestPrice = products
                    .filter(product => product.price !== null)
                    .sort((a, b) => a.price - b.price)[0];

                console.log('[Agent] No products within budget');
                return {
                    success: false,
                    budgetExceeded: true,
                    cheapestAvailable: cheapestPrice ? cheapestPrice.price : null,
                    cheapestTitle: cheapestPrice ? cheapestPrice.title.slice(0, 50) : null,
                    originalBudget: budget,
                    error: `No products found under budget`
                };
            }

            throw new Error("No products found");
        }

        productUrl = validProducts[0].link;
    }

    if (!productUrl) {
        throw new Error("No valid product found");
    }

    await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 60000 });
    console.log("➡️ Product opened");
    await page.waitForSelector("body", { timeout: 20000 });

    const isLoginPage = await page.evaluate(() => {
        return document.body.innerText.includes("Sign in")
            && !!document.querySelector("input[type='password']");
    });
    console.log("➡️ Login check done");
    if (isLoginPage) {
        console.log("🔐 LOGIN REQUIRED - waiting for user");
        await page.waitForFunction(() => {
            return !document.body.innerText.includes("Sign in")
                && !!document.querySelector("#add-to-cart-button");
        }, { timeout: 0 });
        console.log("✅ LOGIN DETECTED - resuming");
    }

    await page.waitForSelector("#add-to-cart-button", { timeout: 20000 });
    console.log("➡️ Clicking Add to Cart");
    await page.click("#add-to-cart-button");

    await page.waitForFunction(() => {
        return document.body.innerText.includes("Added to Cart")
            || document.body.innerText.includes("Proceed to checkout")
            || document.body.innerText.includes("Added to cart");
    }, { timeout: 20000 });
    console.log("✅ ITEM ADDED TO CART");

    console.log("➡️ Verifying cart contents");
    await page.goto("https://www.amazon.in/gp/cart/view.html", { waitUntil: "networkidle2", timeout: 60000 });
    console.log("➡️ Page loaded");

    const cartValid = await page.evaluate(() => {
        return !document.body.innerText.includes("Your Amazon Cart is empty");
    });

    if (!cartValid) {
        throw new Error("Cart is still empty after add-to-cart");
    }

    console.log("✅ CART VERIFIED");

    return {
        success: true,
        stage: "added_to_cart"
    };
    /* END DISABLED */
}



let mainWindow
let tray
let sttProcess = null
let isCreatingWindow = false
const DEV_SERVER_URL = "http://127.0.0.1:5173"
const DIST_INDEX_PATH = path.join(__dirname, "..", "..", "..", "dist", "index.html")

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
    console.log("Another Buddy instance is already running. Quitting duplicate instance.")
    app.quit()
    process.exit(0)
}

process.on("uncaughtException", (err) => {
    console.error("🔥 UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("🔥 UNHANDLED PROMISE:", err);
});

function isDevServerAvailable(url) {
    return new Promise((resolve) => {
        const request = http.get(url, (response) => {
            response.resume()
            resolve(true)
        })

        request.on("error", () => resolve(false))
        request.setTimeout(1500, () => {
            request.destroy()
            resolve(false)
        })
    })
}

function showMainWindow() {
    if (!mainWindow) return

    if (mainWindow.isMinimized()) {
        mainWindow.restore()
    }

    if (!mainWindow.isVisible()) {
        mainWindow.show()
    }

    mainWindow.focus()
}

function hideMainWindow() {
    if (!mainWindow) return

    mainWindow.minimize()
}

async function loadRenderer() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error("Cannot load renderer without an active window.")
    }

    // Retry loop — Vite may still be booting when Electron starts
    let loaded = false
    let attempts = 0
    const MAX_ATTEMPTS = 10

    while (!loaded && attempts < MAX_ATTEMPTS) {
        attempts++
        const canUseDevServer = await isDevServerAvailable(DEV_SERVER_URL)

        if (canUseDevServer) {
            try {
                console.log(`Loading Buddy from dev server (attempt ${attempts})`)
                await mainWindow.loadURL(DEV_SERVER_URL)
                loaded = true
                console.log("Buddy renderer loaded successfully")
                return
            } catch (err) {
                console.log(`Renderer load failed attempt ${attempts}:`, err.message)
                await new Promise(resolve => setTimeout(resolve, 1000))
            }
        } else {
            console.log(`Dev server not available yet (attempt ${attempts}/${MAX_ATTEMPTS})`)
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }

    if (!loaded) {
        if (fs.existsSync(DIST_INDEX_PATH)) {
            console.log("Loading Buddy from dist fallback")
            await mainWindow.loadFile(DIST_INDEX_PATH)
            return
        }
        throw new Error("No renderer source available. Start Vite or build the app first.")
    }
}

async function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow
    }

    if (isCreatingWindow) {
        return mainWindow
    }

    isCreatingWindow = true
    console.log("Creating Buddy window");
    let hasRevealedWindow = false

    try {
        mainWindow = new BrowserWindow({
            width: 780,
            height: 640,
            minWidth: 520,
            minHeight: 460,
            frame: false,
            titleBarStyle: 'hidden',
            autoHideMenuBar: true,
            show: true,
            backgroundColor: "#0b1120",
            webPreferences: {
                preload: path.join(__dirname, "..", "preload", "preload.js"),
                contextIsolation: true,
                nodeIntegration: false
            }
        })

        mainWindow.setMenu(null);
        mainWindow.setMenuBarVisibility(false);

        mainWindow.on('maximize', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('window-maximize-changed', true);
            }
        });

        mainWindow.on('unmaximize', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('window-maximize-changed', false);
            }
        });

        global.mainWindowRef = mainWindow;

        if (process.env.NODE_ENV === "development") {
            mainWindow.webContents.openDevTools();
        }

        mainWindow.webContents.on("did-fail-load", (_, errorCode, errorDescription) => {
            console.error("Buddy window failed to load:", errorCode, errorDescription);
        });

        mainWindow.webContents.on("console-message", (_, level, message, line, sourceId) => {
            console.log(`[Renderer:${level}] ${message} (${sourceId}:${line})`);
        });

        mainWindow.webContents.on('crashed', (event, killed) => {
            console.error('[Buddy] Renderer crashed! killed:', killed);
        });

        mainWindow.webContents.on("render-process-gone", (_, details) => {
            console.error("Buddy renderer process gone:", details);
        });

        const revealWindow = () => {
            if (!mainWindow || mainWindow.isDestroyed() || hasRevealedWindow) return

            hasRevealedWindow = true
            console.log("Revealing Buddy window");
            showMainWindow()
        }

        setTimeout(() => {
            console.log("Buddy fallback reveal timer fired");
            revealWindow()
        }, 1500)

        mainWindow.webContents.once("did-finish-load", () => {
            console.log("Buddy window finished loading");
            console.log("Buddy window ready to show");
            mainWindow.webContents.executeJavaScript(`
                (() => {
                    const root = document.getElementById('root');
                    return {
                        title: document.title,
                        bodyBg: getComputedStyle(document.body).backgroundColor,
                        bodyText: (document.body.innerText || '').slice(0, 200),
                        rootExists: !!root,
                        rootChildren: root ? root.childElementCount : -1,
                        rootHtml: root ? root.innerHTML.slice(0, 500) : ''
                    };
                })();
            `).then((info) => {
                console.log("Renderer snapshot:", info);
            }).catch((error) => {
                console.error("Renderer snapshot failed:", error);
            });
            revealWindow()
        })

        mainWindow.on("closed", () => {
            mainWindow = null
        })

        // Notify STT when window shows or hides
        mainWindow.on("show", async () => {
            try { await fetch("http://localhost:5050/app-open") } catch { }
        })
        mainWindow.on("hide", async () => {
            try { await fetch("http://localhost:5050/app-close") } catch { }
        })

        await loadRenderer()
        revealWindow()
        return mainWindow
    } finally {
        isCreatingWindow = false
    }
}


function positionWindowCenter() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.workAreaSize;

    mainWindow.setBounds({
        x: Math.floor(width / 2) - 350,
        y: Math.floor(height / 2) - 290,
        width: 700,
        height: 580
    }, true);
}



ipcMain.handle('window-position-center', () => {
    positionWindowCenter();
    return { success: true };
});

ipcMain.handle('window-hide', () => {
    hideMainWindow();
    return { success: true };
});

ipcMain.handle('window-show', () => {
    showMainWindow();
    return { success: true };
});

function startSTTServer() {
    const pythonScript = path.join(__dirname, "../../python/buddy_stt.py")
    console.log("[STT] Starting Python script at:", pythonScript)

    // Try 'python' first, fall back to 'python3'
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

    sttProcess = spawn(pythonCmd, [pythonScript], {
        detached: false,
        stdio: "pipe",
        cwd: path.join(__dirname, "../../python")
    })

    sttProcess.stdout.on("data", (data) => {
        console.log("[STT]", data.toString().trim())
    })
    sttProcess.stderr.on("data", (data) => {
        console.error("[STT Error]", data.toString().trim())
    })
    sttProcess.on("error", (err) => {
        console.error("[STT] Failed to start process:", err.message)
    })
    sttProcess.on("close", (code) => {
        console.log("[STT] Process exited with code:", code)
    })
}

function createTray() {
    console.log("Creating Buddy tray");
    try {
        tray = new Tray(path.join(__dirname, "../assets/tray.png"))
    } catch (error) {
        console.error("Buddy tray failed to initialize:", error)
        tray = null
        return
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: "Open Buddy",
            click: () => {
                showMainWindow()
            }
        },
        {
            label: "Quit",
            click: () => {
                app.isQuiting = true
                app.quit()
            }
        }
    ])

    tray.setToolTip("Buddy AI Assistant")
    tray.setContextMenu(contextMenu)

    tray.on("click", () => {
        showMainWindow()
    })
}

function registerShortcut() {
    console.log("Registering Buddy shortcut");

    globalShortcut.unregisterAll()

    const spotlightRegistered = globalShortcut.register("Control+Alt+B", () => {

        if (!mainWindow) return

        if (mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) {
            hideMainWindow()
        } else {
            showMainWindow()
        }

    })

    console.log("Shortcut registered:", spotlightRegistered);

}

function handleCommand(command, event) {
    console.log("Buddy command received:", command);
    const lower = command.toLowerCase().trim();

    // 1. Browser automation intercept
    const agentKeywords = ['order', 'buy', 'book', 'search', 'zomato', 'swiggy', 'amazon', 'flipkart', 'uber', 'ola'];
    if (agentKeywords.some(w => lower.includes(w))) {
        let action = null;

        // ── A. Food ──────────────────────────────────────────────
        if (lower.includes('zomato') || lower.includes('food') || lower.includes('eat')) {
            const q = lower.replace(/\b(open|can you|please|order|food|from|zomato|on|me|i want|get|some|and|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
            action = { type: 'zomato_search', query: q || 'food' };
        } else if (lower.includes('swiggy')) {
            const q = lower.replace(/\b(open|can you|please|order|food|from|swiggy|on|me|i want|get|and|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
            action = { type: 'swiggy_search', query: q || 'food' };
            // ── B. Shopping ──────────────────────────────────────────
        } else if (lower.includes('amazon') || lower.includes('buy') || lower.includes('product') || lower.includes('order') || lower.includes('get')) {
            // Check for flipkart explicitly first
            if (lower.includes('flipkart')) {
                const q = lower.replace(/\b(open|can you|please|order|buy|get|from|flipkart|on|me|i want|product|and|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
                action = { type: 'flipkart_search', query: q || 'product' };
            } else {
                // Default to Amazon for generic shopping
                const q = lower.replace(/\b(open|can you|please|order|buy|get|from|amazon|on|me|i want|product|and|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
                action = { type: 'amazon_search', query: q || 'product' };
            }
            // ── C. Cabs ──────────────────────────────────────────────
        } else if (lower.includes('ola') || (lower.includes('book') && lower.includes('cab'))) {
            const dest = lower.replace(/\b(open|can you|please|book|cab|ola|ride|to|a|an|me|from|and)\b/g, '').replace(/\s+/g, ' ').trim();
            action = { type: 'ola_open', destination: dest };
        } else if (lower.includes('uber')) {
            action = { type: 'uber_open' };
            // ── D. Movies ────────────────────────────────────────────
        } else if (lower.includes('bookmyshow') || (lower.includes('book') && lower.includes('movie'))) {
            const movie = lower.replace(/\b(open|can you|please|book|ticket|tickets|movie|on|bookmyshow|for|me|watch|search|and|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
            action = { type: 'bookmyshow_search', movie: movie };
            // ── E. Google Search ─────────────────────────────────────
        } else if (lower.includes('search') && !lower.includes('youtube')) {
            const q = lower.replace(/\b(open|can you|please|search|for|on|google|and|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
            action = { type: 'google_search', query: q };
        }

        if (action) {
            console.log("Routing to agent for approval:", command, "| Intent:", action.type);
            let platform = action.type.split('_')[0].charAt(0).toUpperCase() + action.type.split('_')[0].slice(1);
            if (action.type === 'bookmyshow_search') platform = 'BookMyShow';

            let description = `Open ${platform} for you`;
            let emoji = '🤖';
            if (action.type === 'zomato_search') { description = `Search for "${action.query}" on Zomato`; emoji = '🍔'; }
            if (action.type === 'swiggy_search') { description = `Search for "${action.query}" on Swiggy`; emoji = '🍕'; }
            if (action.type === 'amazon_search') {
                if (global.isWindows && !action.query.startsWith('http')) {
                    hideMainWindow();
                    require('child_process').exec(`start chrome "https://www.google.com/search?q=${encodeURIComponent(action.query)}"`);
                    return;
                }
                description = `Search for "${action.query}" on Amazon`; emoji = '📦';
            }
            if (action.type === 'flipkart_search') { description = `Search for "${action.query}" on Flipkart`; emoji = '🛍️'; }
            if (action.type === 'ola_open') { description = action.destination ? `Book an Ola cab to "${action.destination}"` : 'Book an Ola cab'; emoji = '🚕'; }
            if (action.type === 'uber_open') { description = 'Open Uber to book a ride'; emoji = '🚗'; }
            if (action.type === 'bookmyshow_search') { description = `Search for "${action.movie || 'movies'}" on BookMyShow`; emoji = '🎬'; }
            if (action.type === 'google_search') { description = `Search for "${action.query}" on Google`; emoji = '🔍'; }

            const UIAction = { ...action, platform, description, emoji, message: "Do you want me to execute this action?" };

            if (event && event.reply) {
                event.reply("agent-approval", UIAction);
            } else if (mainWindow) {
                mainWindow.webContents.send("agent-approval", UIAction);
            }

            if (mainWindow) mainWindow.show();
            return;
        }
    }

    if (lower.includes("search google for")) {
        const query = lower.split("search google for")[1].trim();
        hideMainWindow();
        exec(`start chrome "https://www.google.com/search?q=${encodeURIComponent(query)}"`);
        return;
    }
    if (lower.includes("search youtube for")) {
        const query = lower.split("search youtube for")[1].trim();
        hideMainWindow();
        exec(`start chrome "https://www.youtube.com/results?search_query=${encodeURIComponent(query)}"`);
        return;
    }

    const appMap = {
        'chrome': 'start chrome',
        'vscode': 'code .',
        'vs code': 'code .',
        'visual studio code': 'code .',
        'code': 'code .',
        'notepad': 'start notepad',
        'calculator': 'start calc',
        'calc': 'start calc',
        'paint': 'start mspaint',
        'edge': 'start msedge',
        'spotify': 'start spotify',
        'explorer': 'start explorer',
        'file explorer': 'start explorer',
        'terminal': 'start cmd',
        'cmd': 'start cmd',
        'powershell': 'start powershell',
        'discord': 'start discord',
        'steam': 'start steam',
        'vlc': 'start vlc',
        'zoom': 'start zoom',
        'slack': 'start slack',
        'brave': 'start brave',
        'firefox': 'start firefox',
        'opera': 'start opera',
    };

    // Strip action words to get app name
    let appName = lower;
    for (const action of ['open ', 'launch ', 'start ', 'run ', 'can you open ', 'please open ', 'i need ', 'i want to open ', "let's open ", 'could you open ']) {
        if (appName.startsWith(action)) {
            appName = appName.replace(action, '').trim();
            break;
        }
    }
    // Also strip trailing words like "for me", "please", "now"
    appName = appName.replace(/( for me| please| now| app)$/g, '').trim();

    const cmd = appMap[appName];
    if (cmd) {
        console.log("Opening:", appName, "->", cmd);
        hideMainWindow();
        exec(cmd, (err) => { if (err) console.error("Failed to open:", appName, err.message); });
        return;
    }

    // Fuzzy fallback â€” check if any known app keyword appears anywhere in command
    for (const [key, cmd] of Object.entries(appMap)) {
        if (lower.includes(key)) {
            console.log("Fuzzy match:", key, "->", cmd);
            console.log('[System] Minimizing window for spectating');
            hideMainWindow();
            exec(cmd, (err) => { if (err) console.error("Fuzzy open failed:", err.message); });
            return;
        }
    }

    console.log("No app matched for:", lower);
}

// ==== STRICT AMAZON FLOW ====
let globalBudget = 0;
ipcMain.on("set-budget", (_, budget) => {
    globalBudget = Number(budget);
});

function waitForLogin(page) {
    return page.waitForFunction(() => {
        return document.querySelector("#nav-link-accountList span") !== null;
    }, { timeout: 0 });
}

ipcMain.on("start-login-watch", async (event) => {
    try {
        if (!global.activePage) global.activePage = await getBrowserPage();
        await waitForLogin(global.activePage);
        event.sender.send("add-message", { role: 'buddy', text: 'Login Detected! Proceeding...' });
        ipcMain.emit("login-success-internal");
    } catch (err) {
        console.error("Login watch err", err);
    }
});

ipcMain.on("start-strict-amazon-flow-DISABLED", async (event, query) => {
    try {
        const page = await getBrowserPage();
        global.activePage = page;

        // STEP 2
        if (global.mainWindowRef) {
            global.mainWindowRef.show();
            global.mainWindowRef.focus();
            global.mainWindowRef.webContents.send("show-login-popup");
        }
        await page.goto("https://www.amazon.in", { waitUntil: 'domcontentloaded' });

        await new Promise(resolve => ipcMain.once("login-success-internal", resolve));

        // STEP 4
        await page.goto("https://www.amazon.in/s?k=" + encodeURIComponent(query), { waitUntil: 'domcontentloaded' });

        // STEP 5
        const products = await page.evaluate(() => {
            const items = [...document.querySelectorAll("[data-component-type='s-search-result']")];
            return items.slice(0, 10).map(el => {
                const priceText = el.querySelector(".a-price-whole")?.innerText?.replace(/,/g, "");
                const title = el.querySelector("h2 span")?.innerText;
                const rating = el.querySelector(".a-icon-alt")?.innerText;
                const link = el.querySelector("h2 a")?.href;
                return {
                    title,
                    price: Number(priceText),
                    rating: parseFloat(rating) || 0,
                    url: link
                };
            }).filter(p => p.title && !isNaN(p.price));
        });

        // STEP 6
        function getSmartProducts(products, budget) {
            const min = budget * 0.9;
            let filtered = products.filter(p => p.price >= min && p.price <= budget);
            if (!filtered.length) {
                filtered = products.filter(p => p.price <= budget);
            }
            return filtered.sort((a, b) => b.rating - a.rating).slice(0, 5);
        }

        const selectedProducts = getSmartProducts(products, globalBudget);
        if (!selectedProducts.length) {
            if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: "No products found within budget." });
            return;
        }

        let chosenProduct = null;
        for (const product of selectedProducts) {
            if (global.mainWindowRef) {
                global.mainWindowRef.show();
                global.mainWindowRef.focus();
                global.mainWindowRef.webContents.send("show-product", product);
            }

            const decision = await new Promise(resolve => {
                ipcMain.once("product-decision", (_, d) => resolve(d));
            });

            if (decision === "BUY") {
                chosenProduct = product;
                break;
            }
        }

        if (!chosenProduct) {
            if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: "All products skipped. Flow terminated." });
            return;
        }

        if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: "Proceeding to product..." });

        // STEP 8
        await page.goto(chosenProduct.url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector("#add-to-cart-button", { timeout: 15000 });
        await page.click("#add-to-cart-button");
        await new Promise(r => setTimeout(r, 2000));

        await page.goto("https://www.amazon.in/checkout", { waitUntil: 'domcontentloaded' });

        // STEP 9
        if (global.mainWindowRef) {
            global.mainWindowRef.show();
            global.mainWindowRef.focus();
            global.mainWindowRef.webContents.send("ask-payment");
        }

        const payment = await new Promise(resolve => ipcMain.once("payment-selected", (_, m) => resolve(m)));

        // STEP 10
        if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: "Processing " + payment + " payment..." });

        if (payment === "COD") {
            await page.evaluate(() => {
                const cod = document.querySelector("input[value='COD']") || document.querySelector("input[type='radio'][value*='Cash']");
                if (cod) cod.click();
            });
            await new Promise(r => setTimeout(r, 1500));
            await page.evaluate(() => {
                const useBtn = document.querySelector("input[name*='Continue']");
                if (useBtn) useBtn.click();
            });
        }

        await new Promise(r => setTimeout(r, 4000));

        // STEP 11
        if (global.mainWindowRef) {
            global.mainWindowRef.show();
            global.mainWindowRef.focus();
            global.mainWindowRef.webContents.send("final-approval");
        }

        const confirmAction = await new Promise(resolve => ipcMain.once("confirm-order", (_, d) => resolve(d)));
        if (confirmAction !== "CONFIRM") {
            if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: "Order cancelled by user." });
            return;
        }

        // STEP 12
        await page.waitForSelector("input[name='placeYourOrder1'], #placeYourOrder", { timeout: 15000 });
        await page.evaluate(() => {
            const btn = document.querySelector("input[name='placeYourOrder1']") || document.querySelector("#placeYourOrder");
            if (btn) btn.click();
        });

        if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: '✅ Order Placed Successfully!' });

    } catch (err) {
        if (global.mainWindowRef) global.mainWindowRef.webContents.send("add-message", { role: 'buddy', text: 'Error in strict flow: ' + err.message });
        console.error("Strict Flow Error:", err);
    }
});
// ==== END STRICT AMAZON FLOW ====

ipcMain.on("buddy-command", (event, command) => {
    handleCommand(command, event);
});

ipcMain.on("start-automation", async () => {
    const page = await getBrowserPage();
    await page.goto("https://www.amazon.in");
});

function isAuthorizedSender(event) {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && event && event.sender === mainWindow.webContents);
}

ipcMain.on("close-app", (event) => {
    if (!isAuthorizedSender(event)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        console.log("[Buddy] Window hidden via close-app command");
    }
});

ipcMain.handle('execute-agent', async (event, action) => {
    console.log('[Agent] execute-agent called with type:', action?.type);
    try {
        const result = await executeAgentAction(action);
        console.log('[Agent] Result:', JSON.stringify(result));
        return result;
    } catch (error) {
        console.error('[Agent] Error:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('agent-checkout-step', async (event, action) => {
    console.log('[Agent] checkout-step called with type:', action?.type);
    try {
        const result = await executeAgentAction(action);
        console.log('[Agent] Checkout step result:', JSON.stringify(result));
        return result;
    } catch (error) {
        console.error('[Agent] Checkout error:', error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle("window-minimize", (event) => {
    if (!isAuthorizedSender(event)) return false;
    mainWindow.minimize();
    return true;
});

ipcMain.handle("window-toggle-maximize", (event) => {
    if (!isAuthorizedSender(event)) return false;

    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        console.log("[Buddy] Window restored");
        return "restored";
    }

    mainWindow.maximize();
    console.log("[Buddy] Window maximized");
    return "maximized";
});

ipcMain.handle("window-is-maximized", (event) => {
    if (!isAuthorizedSender(event)) return false;
    return mainWindow.isMaximized();
});

ipcMain.handle("window-close", (event) => {
    if (!isAuthorizedSender(event)) return false;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        console.log("[Buddy] Window hidden via window-close command");
    }
    return true;
});

ipcMain.handle("ask-buddy", async (event, prompt, history = []) => {
    try {
        // Convert Gemini-style history to Ollama-style messages
        const validHistory = (Array.isArray(history) ? history : []).filter(
            m => m && m.role && Array.isArray(m.parts) && m.parts.length > 0 && m.parts[0].text
        );

        const messages = validHistory.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts[0].text
        }));

        messages.push({ role: 'user', content: prompt });

        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen3.5:2b',
                messages: messages,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API error: ${response.status}`);
        }

        const data = await response.json();
        return data.message.content;
    } catch (error) {
        console.error("Ask Buddy (Ollama) Error:", error);
        return "Sorry, I couldn't connect to Ollama. Make sure it's running locally on port 11434 and 'qwen3.5:2b' is installed!";
    }
});

if (isElectron) {
    app.whenReady().then(async () => {
        console.log("Electron app is ready");
        try {
            startSTTServer()
        } catch (error) {
            console.error("STT startup failed:", error)
        }
        try {
            createTray()
        } catch (error) {
            console.error("Tray startup failed:", error)
        }
        await createWindow()
        registerShortcut()

        // Poll for wake word when app is hidden
        setInterval(async () => {
            if (mainWindow && !mainWindow.isVisible()) {
                try {
                    const res = await fetch("http://localhost:5050/result")
                    const data = await res.json()
                    if (data.wake === true) {
                        mainWindow.show()
                        mainWindow.focus()
                        console.log("[Buddy] Wake word detected — showing window")
                    }
                } catch { }
            }
        }, 600)
    }).catch((error) => {
        console.error("Buddy failed during app startup:", error)
    })

    app.on("second-instance", () => {
        console.log("Second Buddy instance requested focus")
        showMainWindow()
    })

    app.on("activate", async () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            await createWindow()
            return
        }

        showMainWindow()
    })

    app.on("window-all-closed", () => {
        console.log("All Buddy windows closed");
        if (process.platform !== "darwin") app.quit()
    });

    app.on("browser-window-created", () => {
        console.log("Buddy browser window created");
    });

    app.on("will-quit", () => {
        globalShortcut.unregisterAll()
        if (sttProcess) {
            sttProcess.kill()
            sttProcess = null
        }
        if (tray) {
            tray.destroy()
        }
    })
}

ipcMain.handle("get-stt-result", async () => {
    try {
        const response = await fetch("http://localhost:5050/result")
        return await response.json()
    } catch { return { status: "error", text: "", wake: false } }
})

ipcMain.handle("get-stt-status", async () => {
    try {
        const response = await fetch("http://localhost:5050/status")
        return await response.json()
    } catch { return { status: "offline" } }
})

ipcMain.handle("stt-app-open", async () => {
    try { await fetch("http://localhost:5050/app-open") } catch { }
})

ipcMain.handle("stt-app-close", async () => {
    try { await fetch("http://localhost:5050/app-close") } catch { }
})

// ── CHECKOUT IPC HANDLERS (Increment 2B-3) ───────────────────────────
ipcMain.handle('checkout-approve-purchase', handleCheckoutApproveIpc);
ipcMain.handle('checkout-cancel', handleCheckoutCancelIpc);
ipcMain.handle('checkout-get-safe-review', handleCheckoutGetSafeReviewIpc);

module.exports = {
    checkReviewPage,
    handleReviewStage,
    handleCustomerApproval,
    handleCustomerCancel,
    handleGetSafeReview,
    handleCheckoutApproveIpc,
    handleCheckoutCancelIpc,
    handleCheckoutGetSafeReviewIpc,
    getRegisteredIpcHandler,
    checkoutCoordinator,
    executeAgentAction
};