/**
 * Buddy AI — Pure Node.js Checkout Safety Engine
 * 
 * Module: backend/electron/checkout/CheckoutSafetyEngine.cjs
 * 
 * Production safety engine housing:
 * 1. ReviewEvidenceEvaluator: fail-closed evaluation of checkout review DOM evidence.
 * 2. PurchaseSnapshotExtractor: line-item child ASIN scoping, integer-paise arithmetic, component reconciliation.
 * 3. CheckoutSessionGuard: 12-state machine, single-use approval token lifecycle, atomic concurrency locks, same-ASIN uncertainty locking.
 * 4. CheckoutLedger: append-only JSONL persistence, async queue serialization, circuit breaker, corrupt-tail quarantine, startup crash recovery.
 * 
 * Invariant: Standalone CommonJS module with ZERO top-level Electron runtime dependencies.
 * Directly importable in pure Node.js test suites and in the Electron main process.
 * 
 * ============================================================================
 * TRUST BOUNDARY & ARCHITECTURAL SCOPE SPECIFICATION
 * ============================================================================
 * 1. In-Memory Guard Scope:
 *    - CheckoutSessionGuard maintains active checkout session state, locking flags,
 *      and ephemeral approval tokens strictly in Node.js process heap memory.
 *    - It protects only calls routed through the same main-process instance.
 *    - Tokens do NOT survive application restarts (by design). Unfinished sessions
 *      are recovered exclusively from the durable append-only JSONL ledger.
 * 2. Zero-Trust Renderer IPC Contract:
 *    - The renderer process (UI/Spotlight) is completely untrusted.
 *    - The IPC contract enforces that the renderer sends ONLY { checkoutSessionId, snapshotId }
 *      for approval and { checkoutSessionId, approvalToken } for order dispatch.
 *    - The renderer CANNOT supply, alter, or override the authoritative snapshot,
 *      child ASIN, item price, grand total, quantity, page binding, approval status,
 *      or dispatch state.
 *    - All execution parameters are looked up and validated against the internal
 *      canonical snapshot in backend memory, protected by SHA-256 integrity checksums.
 * 3. Authentication Limits:
 *    - Renderer frames are authenticated via Electron's internal frame routing.
 *    - Local capabilities do NOT provide cryptographic renderer authentication
 *      nor server-side idempotency with Amazon India.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ============================================================================
// 1. CONSTANTS & ENUMS
// ============================================================================

const STATES = Object.freeze({
  CART_ISOLATED: 'CART_ISOLATED',
  REVIEW_VERIFIED: 'REVIEW_VERIFIED',
  AWAITING_CUSTOMER_APPROVAL: 'AWAITING_CUSTOMER_APPROVAL',
  PURCHASE_APPROVED: 'PURCHASE_APPROVED',
  PREFLIGHT_VERIFIED: 'PREFLIGHT_VERIFIED',
  INTENT_PREPARED: 'INTENT_PREPARED',
  DISPATCH_MAY_HAVE_STARTED: 'DISPATCH_MAY_HAVE_STARTED', // [POINT OF NO RETURN]
  DISPATCH_CALL_RETURNED: 'DISPATCH_CALL_RETURNED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  SUBMISSION_UNCERTAIN: 'SUBMISSION_UNCERTAIN',
  CHECKOUT_ABORTED: 'CHECKOUT_ABORTED',
  CHECKOUT_FAILED: 'CHECKOUT_FAILED'
});

const TERMINAL_STATES = Object.freeze([
  STATES.ORDER_CONFIRMED,
  STATES.SUBMISSION_UNCERTAIN,
  STATES.CHECKOUT_ABORTED,
  STATES.CHECKOUT_FAILED
]);

const LEGAL_TRANSITIONS = Object.freeze({
  [STATES.CART_ISOLATED]: [STATES.REVIEW_VERIFIED, STATES.CHECKOUT_FAILED, STATES.CHECKOUT_ABORTED],
  [STATES.REVIEW_VERIFIED]: [STATES.AWAITING_CUSTOMER_APPROVAL, STATES.CHECKOUT_ABORTED],
  [STATES.AWAITING_CUSTOMER_APPROVAL]: [STATES.PURCHASE_APPROVED, STATES.CHECKOUT_ABORTED],
  [STATES.PURCHASE_APPROVED]: [STATES.PREFLIGHT_VERIFIED, STATES.CHECKOUT_ABORTED],
  [STATES.PREFLIGHT_VERIFIED]: [STATES.INTENT_PREPARED, STATES.CHECKOUT_ABORTED],
  [STATES.INTENT_PREPARED]: [STATES.DISPATCH_MAY_HAVE_STARTED, STATES.SUBMISSION_UNCERTAIN, STATES.CHECKOUT_ABORTED],
  [STATES.DISPATCH_MAY_HAVE_STARTED]: [STATES.DISPATCH_CALL_RETURNED, STATES.SUBMISSION_UNCERTAIN, STATES.CHECKOUT_ABORTED],
  [STATES.DISPATCH_CALL_RETURNED]: [STATES.ORDER_CONFIRMED, STATES.SUBMISSION_UNCERTAIN],
  [STATES.ORDER_CONFIRMED]: [],
  [STATES.SUBMISSION_UNCERTAIN]: [],
  [STATES.CHECKOUT_ABORTED]: [],
  [STATES.CHECKOUT_FAILED]: []
});

const CANONICAL_FIELDS = Object.freeze([
  'schemaVersion',
  'snapshotId',
  'checkoutSessionId',
  'boundPageId',
  'targetAsin',
  'extractedAsin',
  'title',
  'variant',
  'quantity',
  'itemPricePaise',
  'shippingPricePaise',
  'codFeePaise',
  'platformFeePaise',
  'taxPricePaise',
  'discountPaise',
  'totalPayablePaise',
  'currency',
  'approvedBudgetPaise',
  'deliveryAddressSummary',
  'paymentMethodSummary',
  'createdAt',
  'expiresAt'
]);

// ============================================================================
// 2. CURRENCY & CANONICAL SERIALIZATION UTILITIES
// ============================================================================

/**
 * Parses numeric or formatted currency string to integer paise.
 * Rejects malformed decimals (>2 decimal places, multiple dots, non-numeric garbage).
 * Never silently truncates fractional digits.
 */
function toIntegerPaise(amount) {
  if (amount === undefined || amount === null) return 0;
  if (typeof amount === 'number') {
    if (isNaN(amount) || !isFinite(amount)) return NaN;
    // Reject numbers with fractional paise (e.g. 19.999)
    const rounded = Math.round(amount * 100);
    if (Math.abs(amount * 100 - rounded) > 1e-4) {
      return NaN;
    }
    return rounded;
  }
  if (typeof amount !== 'string') return NaN;

  const raw = amount.trim();
  if (!raw) return NaN;

  const isNegative = /^-/.test(raw) || /-\s*(?:₹|INR|Rs)/i.test(raw) || /(?:₹|INR|Rs)\s*-/i.test(raw) || /^\(.*\)$/.test(raw) || /^minus\b/i.test(raw);

  // Remove currency symbols/names, parens, signs, whitespace
  const clean = raw.replace(/(?:₹|INR|Rs\.?)/gi, '').replace(/[()\-+\s]/g, '');
  if (!clean) return NaN;

  // Must strictly match either comma-formatted or unformatted digits with optional single dot
  // E.g. "19,990.00", "19990.00", "19990", "0.50", "49.5"
  if (!/^\d{1,3}(?:,\d{2,3})*(?:\.\d+)?$/.test(clean) && !/^\d+(?:\.\d+)?$/.test(clean)) {
    return NaN;
  }

  const noCommas = clean.replace(/,/g, '');
  const parts = noCommas.split('.');
  if (parts.length > 2) return NaN;

  const rupees = parseInt(parts[0], 10);
  if (isNaN(rupees)) return NaN;

  let paise = 0;
  if (parts.length === 2) {
    const dec = parts[1];
    // Reject more than 2 decimal digits: NEVER silently truncate!
    if (dec.length > 2) {
      return NaN;
    }
    if (dec.length === 1) {
      paise = parseInt(dec + '0', 10);
    } else if (dec.length === 2) {
      paise = parseInt(dec, 10);
    }
  }

  const total = rupees * 100 + paise;
  return isNegative ? -total : total;
}

/**
 * Builds normalized canonical string delimited by Unit Separator (\x1f).
 */
function computeCanonicalString(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('SNAPSHOT_OBJECT_REQUIRED');
  }

  const values = CANONICAL_FIELDS.map(fieldName => {
    const val = snapshot[fieldName];
    if (val === undefined || val === null) {
      return '';
    }
    if (typeof val === 'string') {
      return val.trim().normalize('NFKC');
    }
    if (typeof val === 'number') {
      return String(Math.trunc(val));
    }
    return String(val).trim().normalize('NFKC');
  });

  return values.join('\x1f');
}

/**
 * Computes SHA-256 hex digest over normalized canonical snapshot string.
 */
function computeCanonicalChecksum(snapshot) {
  const canonicalStr = computeCanonicalString(snapshot);
  return crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
}

/**
 * Validates canonical checksum integrity against snapshot fields.
 */
function verifySnapshotChecksum(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.canonicalChecksum) {
    return false;
  }
  try {
    const expected = computeCanonicalChecksum(snapshot);
    return expected === snapshot.canonicalChecksum;
  } catch (err) {
    return false;
  }
}

// Helpers for string inspection in synthetic DOM
function idOrClassExists(html, identifier) {
  const idRegex = new RegExp(`id=["']${identifier}["']`, 'i');
  const classRegex = new RegExp(`class=["'][^"']*\\b${identifier}\\b[^"']*["']`, 'i');
  return idRegex.test(html) || classRegex.test(html);
}

function extractElementSnippet(html, identifier) {
  const match = html.match(new RegExp(`<[^>]*?(?:id|name)=["']${identifier}["'][^>]*?>`, 'i'));
  return match ? match[0] : '';
}

// ============================================================================
// 3. REVIEW EVIDENCE EVALUATOR
// ============================================================================

/**
 * Evaluates checkout review DOM evidence in a strict, fail-closed manner.
 */
class ReviewEvidenceEvaluator {
  static evaluate(htmlString, url) {
    if (!htmlString || typeof htmlString !== 'string') {
      return { status: 'NOT_VERIFIED', reason: 'EMPTY_DOM' };
    }
    if (!url || typeof url !== 'string') {
      return { status: 'NOT_VERIFIED', reason: 'EMPTY_URL' };
    }

    // 1. Negative Evidence (Immediate Rejection)
    const hasPaySelectUrl = url.includes('/payselect/');
    const hasAddressSelectUrl = url.includes('/addressselect/');
    const paymentSectionCollapsed = /id=["']payment-information["'][^>]*?class=["'][^"']*checkout-accordion-collapsed/i.test(htmlString);
    const hasActivePaymentRadio = /name=["']ppw-instrumentRowSelection["'][^>]*?(?:checked|id)/i.test(htmlString) &&
                                  !paymentSectionCollapsed;
    const hasActiveLoadingSpinner = /class=["'][^"']*(?:a-spinner-wrapper|loading-spinner|loading-mask)[^"']*["']/i.test(htmlString);
    const hasCheckoutAlertError = /class=["'][^"']*a-alert-error[^"']*["']/i.test(htmlString);

    const negativeSignals = [];
    if (hasPaySelectUrl) negativeSignals.push('PAY_SELECT_URL');
    if (hasAddressSelectUrl) negativeSignals.push('ADDRESS_SELECT_URL');
    if (hasActivePaymentRadio) negativeSignals.push('ACTIVE_PAYMENT_RADIO_VISIBLE');
    if (hasActiveLoadingSpinner) negativeSignals.push('ACTIVE_SPINNER_VISIBLE');
    if (hasCheckoutAlertError) negativeSignals.push('ERROR_ALERT_PRESENT');

    // 2. Positive Evidence
    const isSpcReviewUrl = url.includes('/gp/buy/spc/handlers/display.html') || url.includes('/gp/buy/review/');
    const hasReviewItemsContainer = idOrClassExists(htmlString, 'spc-orders') || idOrClassExists(htmlString, 'spc-orders-container');
    const hasPlaceOrderButton = /(?:name=["']placeYourOrder1["']|id=["']placeYourOrder["']|id=["']submitOrderButtonId["'])/i.test(htmlString);
    const isButtonDisabled = /disabled|aria-disabled=["']true["']|class=["'][^"']*a-button-disabled/i.test(
      extractElementSnippet(htmlString, 'submitOrderButtonId') || extractElementSnippet(htmlString, 'placeYourOrder1')
    );
    const hasGrandTotal = /(?:class=["'][^"']*grand-total-price[^"']*["']|subtotals-marketplace-table)/i.test(htmlString);

    // 3. Contradictory Evidence Evaluation
    if (negativeSignals.length > 0 && hasPlaceOrderButton && !isButtonDisabled) {
      return {
        status: 'CONTRADICTORY_SIGNALS',
        reason: 'Enabled Place Order button detected while negative signals are active: ' + negativeSignals.join(', '),
        negativeSignals
      };
    }

    if (negativeSignals.length > 0) {
      return {
        status: 'NOT_VERIFIED',
        reason: 'Negative signals present: ' + negativeSignals.join(', '),
        negativeSignals
      };
    }

    // 4. Positive Conjunction
    if (!isSpcReviewUrl) {
      return { status: 'NOT_VERIFIED', reason: 'URL_NOT_REVIEW_SPC_HANDLER' };
    }
    if (!hasReviewItemsContainer) {
      return { status: 'NOT_VERIFIED', reason: 'REVIEW_SHIPMENT_CONTAINER_MISSING' };
    }
    if (!hasPlaceOrderButton) {
      return { status: 'NOT_VERIFIED', reason: 'PLACE_ORDER_BUTTON_MISSING' };
    }
    if (isButtonDisabled) {
      return { status: 'NOT_VERIFIED', reason: 'PLACE_ORDER_BUTTON_DISABLED' };
    }
    if (!hasGrandTotal) {
      return { status: 'NOT_VERIFIED', reason: 'GRAND_TOTAL_CONTAINER_MISSING' };
    }

    return {
      status: 'VERIFIED',
      reason: 'All positive evidence present and negative signals absent'
    };
  }
}

// ============================================================================
// 4. PURCHASE SNAPSHOT EXTRACTOR
// ============================================================================

/**
 * Extracts line-item ASIN, quantity, integer-paise price components, and verifies reconciliation.
 * 
 * FAIL-CLOSED CONDITIONS:
 * - REVIEW_CONTAINER_MISSING: #spc-orders container absent.
 * - ASIN_UNREADABLE: No valid 10-character child ASIN anchor in #spc-orders.
 * - ASIN_MISMATCH: Extracted child ASIN does not match expected target ASIN.
 * - MULTIPLE_ITEMS_IN_CHECKOUT: More than 1 distinct item row in shipment container.
 * - QUANTITY_UNREADABLE: Quantity element absent or unparseable.
 * - QUANTITY_MISMATCH: Extracted quantity is not exactly equal to expected quantity (1).
 * - PRICE_SUMMARY_TABLE_MISSING: #subtotals-marketplace-table absent (never assumes item == total).
 * - TOTAL_UNREADABLE / TOTAL_INVALID: Grand total absent, NaN, negative, or zero.
 * - ITEM_PRICE_COMPONENT_MISSING: No explicit Items/MRP line found in subtotals table.
 * - DUPLICATE_PRICE_COMPONENT: Duplicate component category row detected in subtotals table.
 * - UNKNOWN_PRICE_COMPONENT: Any line item not explicitly recognized in allowlist.
 * - PRICE_COMPONENT_UNREADABLE: Any component amount cannot be parsed to integer paise.
 * - PRICE_RECONCILIATION_FAILED: Component sum differs from grand total by >= 1 paisa.
 * - BUDGET_EXCEEDED: Grand total exceeds user approved budget.
 */
class PurchaseSnapshotExtractor {
  static extract(optionsOrHtml, expectedAsinArg, expectedQuantityArg = 1, approvedBudgetArg) {
    let htmlString;
    let expectedAsin;
    let expectedQuantity = 1;
    let approvedBudgetPaise;
    let checkoutSessionId;
    let boundPageId;

    if (typeof optionsOrHtml === 'object' && optionsOrHtml !== null) {
      htmlString = optionsOrHtml.htmlString;
      expectedAsin = optionsOrHtml.expectedAsin;
      expectedQuantity = optionsOrHtml.expectedQuantity !== undefined ? optionsOrHtml.expectedQuantity : 1;
      approvedBudgetPaise = optionsOrHtml.approvedBudgetPaise !== undefined ? optionsOrHtml.approvedBudgetPaise : toIntegerPaise(optionsOrHtml.approvedBudget);
      checkoutSessionId = optionsOrHtml.checkoutSessionId;
      boundPageId = optionsOrHtml.boundPageId;
    } else {
      htmlString = optionsOrHtml;
      expectedAsin = expectedAsinArg;
      expectedQuantity = expectedQuantityArg !== undefined ? expectedQuantityArg : 1;
      if (approvedBudgetArg !== undefined && approvedBudgetArg !== null) {
        approvedBudgetPaise = approvedBudgetArg > 100000 ? Math.round(approvedBudgetArg) : toIntegerPaise(approvedBudgetArg);
      }
    }

    if (!htmlString) throw new Error('DOM_REQUIRED');

    // 1. Strict Container Scoping: Isolate #spc-orders to ignore carousels and recommendations
    const spcOrdersMatch = htmlString.match(/<div[^>]*?id=["']spc-orders["'][^>]*?>([\s\S]*?)(?:<div[^>]*?id=["']spc-order-summary["']|<div[^>]*?id=["']rhf["']|$)/i);
    const shipmentHtml = spcOrdersMatch ? spcOrdersMatch[1] : '';

    if (!shipmentHtml) {
      return { success: false, reason: 'REVIEW_CONTAINER_MISSING' };
    }

    // 2. Line-item Child ASIN extraction
    const asinMatch = shipmentHtml.match(/(?:\/dp\/|\/product\/|\/asin\/)([A-Z0-9]{10})/i);
    const extractedAsin = asinMatch ? asinMatch[1].toUpperCase() : null;

    if (!extractedAsin) {
      return { success: false, reason: 'ASIN_UNREADABLE' };
    }
    if (expectedAsin && extractedAsin !== expectedAsin.toUpperCase()) {
      return { success: false, reason: 'ASIN_MISMATCH', extractedAsin, expectedAsin: expectedAsin.toUpperCase() };
    }

    // 3. Multi-item check in shipment container
    const distinctItemMatches = shipmentHtml.match(/class=["'][^"']*(?:spc-product-summary|sc-product-content)[^"']*["']/g) || [];
    if (distinctItemMatches.length > 1) {
      return { success: false, reason: 'MULTIPLE_ITEMS_IN_CHECKOUT', count: distinctItemMatches.length };
    }

    // 4. Quantity extraction
    const qtyMatch = shipmentHtml.match(/(?:Quantity:\s*<\/span>\s*<span[^>]*?>|data-testid=["']item-quantity["'][^>]*?>)(\d+)/i) ||
                     shipmentHtml.match(/Qty:\s*(\d+)/i);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : null;

    if (quantity === null || isNaN(quantity)) {
      return { success: false, reason: 'QUANTITY_UNREADABLE' };
    }
    if (quantity !== expectedQuantity) {
      return { success: false, reason: 'QUANTITY_MISMATCH', quantity, expectedQuantity };
    }

    // 5. Title & Variant extraction
    const titleMatch = shipmentHtml.match(/class=["'][^"']*(?:sc-product-title|item-title-row)[^"']*["'][^>]*?>([\s\S]*?)<\/a>/i);
    const rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Amazon Item';

    const variantMatch = shipmentHtml.match(/class=["'][^"']*item-variant-row[^"']*["'][^>]*?>([\s\S]*?)<\/div>/i);
    const rawVariant = variantMatch ? variantMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    // 6. Strict Subtotals Table Requirement
    // Rule: Avoid treating missing item-price data as proof that item price equals grand total.
    const tableMatch = htmlString.match(/id=["']subtotals-marketplace-table["'][^>]*?>([\s\S]*?)<\/div>\s*<\/div>/i) ||
                       htmlString.match(/id=["']subtotals-marketplace-table["'][^>]*?>([\s\S]*?)<\/div>/i);

    if (!tableMatch) {
      return { success: false, reason: 'PRICE_SUMMARY_TABLE_MISSING' };
    }

    // 7. Grand total extraction
    const totalMatch = htmlString.match(/class=["'][^"']*grand-total-price[^"']*["'][^>]*?>\s*([^<]+)/i);
    if (!totalMatch) {
      return { success: false, reason: 'TOTAL_UNREADABLE' };
    }
    const totalPayablePaise = toIntegerPaise(totalMatch[1]);
    if (isNaN(totalPayablePaise) || totalPayablePaise <= 0) {
      return { success: false, reason: 'TOTAL_INVALID' };
    }

    const tableHtml = tableMatch[1];
    const rowMatches = tableHtml.match(/<div[^>]*?class=["'][^"']*a-row[^"']*["'][^>]*?>([\s\S]*?)<\/div>/gi) || [];

    if (rowMatches.length === 0) {
      return { success: false, reason: 'PRICE_SUMMARY_ROWS_MISSING' };
    }

    let itemPricePaise = null;
    let shippingPricePaise = 0;
    let codFeePaise = 0;
    let platformFeePaise = 0;
    let taxPricePaise = 0;
    let discountPaise = 0;
    const seenCategories = new Set();

    for (const rowHtml of rowMatches) {
      const rawSpans = [...rowHtml.matchAll(/<span[^>]*?>([\s\S]*?)<\/span>/gi)];
      if (rawSpans.length < 2) {
        return { success: false, reason: 'PRICE_COMPONENT_UNREADABLE', detail: 'Row does not contain label and amount' };
      }

      const label = rawSpans[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      const amountStr = rawSpans[rawSpans.length - 1][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (!amountStr) {
        return { success: false, reason: 'PRICE_COMPONENT_UNREADABLE', label };
      }

      const parsedPaise = toIntegerPaise(amountStr);
      if (isNaN(parsedPaise)) {
        return { success: false, reason: 'PRICE_COMPONENT_UNREADABLE', label, amountStr };
      }

      let category = null;
      if (/^(?:items?|item price|mrp):?$/i.test(label)) {
        category = 'ITEMS';
      } else if (/^(?:delivery|shipping(?:\s*&\s*handling)?):?$/i.test(label)) {
        category = 'SHIPPING';
      } else if (/^(?:cash on delivery|cod|pay on delivery)(?:\s*fee)?:?$/i.test(label)) {
        category = 'COD';
      } else if (/^platform\s*fee:?$/i.test(label)) {
        category = 'PLATFORM';
      } else if (/^(?:estimated\s*tax|tax|gst|vat):?$/i.test(label)) {
        category = 'TAX';
      } else if (/^(?:promotion|discount|coupon|savings|promotion applied):?$/i.test(label)) {
        category = 'DISCOUNT';
      } else if (/^(?:order\s*total|grand\s*total):?$/i.test(label)) {
        category = 'TOTAL';
      } else {
        return {
          success: false,
          reason: 'UNKNOWN_PRICE_COMPONENT',
          unrecognizedLabel: label
        };
      }

      if (seenCategories.has(category)) {
        return {
          success: false,
          reason: 'DUPLICATE_PRICE_COMPONENT',
          duplicateCategory: category,
          label
        };
      }
      seenCategories.add(category);

      if (category === 'ITEMS') {
        itemPricePaise = parsedPaise;
      } else if (category === 'SHIPPING') {
        shippingPricePaise = parsedPaise;
      } else if (category === 'COD') {
        codFeePaise = parsedPaise;
      } else if (category === 'PLATFORM') {
        platformFeePaise = parsedPaise;
      } else if (category === 'TAX') {
        taxPricePaise = parsedPaise;
      } else if (category === 'DISCOUNT') {
        discountPaise = Math.abs(parsedPaise);
      }
    }

    if (itemPricePaise === null) {
      return { success: false, reason: 'ITEM_PRICE_COMPONENT_MISSING' };
    }

    // 8. Component Reconciliation Rule:
    const expectedTotalPaise = itemPricePaise + shippingPricePaise + codFeePaise + platformFeePaise + taxPricePaise - discountPaise;
    if (expectedTotalPaise !== totalPayablePaise) {
      return {
        success: false,
        reason: 'PRICE_RECONCILIATION_FAILED',
        expectedTotalPaise,
        totalPayablePaise,
        diff: totalPayablePaise - expectedTotalPaise
      };
    }

    // 9. Budget inclusivity check
    if (approvedBudgetPaise !== undefined && approvedBudgetPaise !== null) {
      if (totalPayablePaise > approvedBudgetPaise) {
        return {
          success: false,
          reason: 'BUDGET_EXCEEDED',
          totalPayablePaise,
          approvedBudgetPaise,
          totalPayable: totalPayablePaise / 100,
          approvedBudget: approvedBudgetPaise / 100
        };
      }
    }

    // 10. Extract metadata summaries
    const addressMatch = htmlString.match(/id=["']address-summary-section["'][^>]*?>([\s\S]*?)<\/div>/i);
    const deliveryAddressSummary = addressMatch ? addressMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'Standard Delivery';

    const paymentMatch = htmlString.match(/id=["']payment-summary-section["'][^>]*?>([\s\S]*?)<\/div>/i);
    const paymentMethodSummary = paymentMatch ? paymentMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : 'Selected Payment Method';

    // 11. Construct Canonical Purchase Snapshot
    const createdAt = Date.now();
    const expiresAt = createdAt + 180000; // 3-minute TTL

    const snapshot = {
      schemaVersion: 2,
      snapshotId: 'snap_' + crypto.randomUUID(),
      checkoutSessionId: checkoutSessionId || ('chk_' + crypto.randomUUID()),
      boundPageId: boundPageId || 'page_synthetic',
      targetAsin: expectedAsin ? expectedAsin.toUpperCase() : extractedAsin,
      extractedAsin,
      title: rawTitle,
      variant: rawVariant,
      quantity,
      itemPricePaise,
      shippingPricePaise,
      codFeePaise,
      platformFeePaise,
      taxPricePaise,
      discountPaise,
      totalPayablePaise,
      currency: 'INR',
      approvedBudgetPaise: approvedBudgetPaise || null,
      deliveryAddressSummary,
      paymentMethodSummary,
      createdAt,
      expiresAt,
      totalPayable: totalPayablePaise / 100,
      approvedBudget: approvedBudgetPaise ? approvedBudgetPaise / 100 : null,
      asin: extractedAsin
    };

    snapshot.canonicalChecksum = computeCanonicalChecksum(snapshot);

    return {
      success: true,
      snapshot
    };
  }
}

// ============================================================================
// 5. CHECKOUT SESSION GUARD
// ============================================================================

/**
 * Manages the 12-state checkout lifecycle, single-use token issuance, atomic concurrency locks,
 * and same-ASIN uncertainty lockouts.
 */
class CheckoutSessionGuard {
  constructor() {
    this.activeSession = null;
    this.archivedSessions = new Map();
    this.uncertainSessions = new Map();
    this.lockedAsins = new Set();
  }

  transitionState(sessionId, targetState, context = {}) {
    if (!this.activeSession || this.activeSession.checkoutSessionId !== sessionId) {
      throw new Error(`SESSION_NOT_ACTIVE: Expected session ${sessionId}`);
    }

    const currentState = this.activeSession.state;
    const allowed = LEGAL_TRANSITIONS[currentState] || [];

    if (!allowed.includes(targetState)) {
      throw new Error(`INVALID_STATE_TRANSITION: Cannot transition from ${currentState} to ${targetState}`);
    }

    if (currentState === STATES.DISPATCH_MAY_HAVE_STARTED && targetState === STATES.CHECKOUT_ABORTED) {
      if (!context.provenPreClickAbort) {
        throw new Error('ILLEGAL_TRANSITION_PAST_POINT_OF_NO_RETURN: Cannot abort past dispatch without proven pre-click abort');
      }
    }

    this.activeSession.state = targetState;
  }

  startSession(targetAsin, approvedBudget, options = {}) {
    const normalizedAsin = targetAsin.toUpperCase();

    if (this.lockedAsins.has(normalizedAsin)) {
      if (options.supersedesAttemptId && options.userAcceptedDuplicateRisk) {
        const superseded = this.uncertainSessions.get(options.supersedesAttemptId);
        if (!superseded) {
          throw new Error(`SUPERSEDED_SESSION_NOT_FOUND: ${options.supersedesAttemptId}`);
        }
      } else {
        throw new Error(`ASIN_ATTEMPT_UNCERTAIN_LOCKED: Attempt for ASIN ${normalizedAsin} is STILL_UNCERTAIN`);
      }
    }

    if (this.activeSession && !TERMINAL_STATES.includes(this.activeSession.state)) {
      this.activeSession.state = STATES.CHECKOUT_ABORTED;
      this.activeSession.approvalToken = null;
      this.archivedSessions.set(this.activeSession.checkoutSessionId, { ...this.activeSession });
    }

    const sessionId = 'chk_' + crypto.randomUUID();
    const approvedBudgetPaise = approvedBudget ? (approvedBudget > 100000 ? Math.round(approvedBudget) : toIntegerPaise(approvedBudget)) : null;

    this.activeSession = {
      checkoutSessionId: sessionId,
      targetAsin: normalizedAsin,
      approvedBudgetPaise,
      approvedBudget: approvedBudget || null,
      state: STATES.CART_ISOLATED,
      snapshot: null,
      approvalToken: null,
      approvalTokenExpiresAt: null,
      tokenConsumed: false,
      isSubmitting: false,
      terminalOutcome: null,
      supersedesAttemptId: options.supersedesAttemptId || null,
      createdAt: Date.now()
    };

    return sessionId;
  }

  setReviewSnapshot(sessionId, snapshot) {
    if (!this.activeSession || this.activeSession.checkoutSessionId !== sessionId) {
      throw new Error('SESSION_NOT_FOUND');
    }
    if (!verifySnapshotChecksum(snapshot)) {
      throw new Error('SNAPSHOT_CHECKSUM_CORRUPTED');
    }
    if (Date.now() > snapshot.expiresAt) {
      throw new Error('SNAPSHOT_EXPIRED');
    }

    this.transitionState(sessionId, STATES.REVIEW_VERIFIED);
    this.transitionState(sessionId, STATES.AWAITING_CUSTOMER_APPROVAL);

    this.activeSession.snapshot = snapshot;
    this.activeSession.approvalToken = null;
    this.activeSession.approvalTokenExpiresAt = null;
    this.activeSession.tokenConsumed = false;
  }

  approvePurchase(sessionId, snapshotId) {
    if (!this.activeSession || this.activeSession.checkoutSessionId !== sessionId) {
      return { success: false, reason: 'SESSION_MISMATCH' };
    }
    if (this.activeSession.state !== STATES.AWAITING_CUSTOMER_APPROVAL) {
      return { success: false, reason: 'INVALID_STATE_FOR_APPROVAL', state: this.activeSession.state };
    }
    if (!this.activeSession.snapshot || this.activeSession.snapshot.snapshotId !== snapshotId) {
      return { success: false, reason: 'SNAPSHOT_MISMATCH' };
    }
    if (Date.now() > this.activeSession.snapshot.expiresAt) {
      return { success: false, reason: 'SNAPSHOT_EXPIRED' };
    }
    if (!verifySnapshotChecksum(this.activeSession.snapshot)) {
      return { success: false, reason: 'SNAPSHOT_CHECKSUM_CORRUPTED' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    this.activeSession.approvalToken = token;
    this.activeSession.approvalTokenExpiresAt = Date.now() + 60000; // 60s TTL
    this.activeSession.tokenConsumed = false;

    this.transitionState(sessionId, STATES.PURCHASE_APPROVED);
    return { success: true, approvalToken: token };
  }

  cancelApproval(sessionId, reason = 'USER_CANCELLED') {
    if (!this.activeSession || this.activeSession.checkoutSessionId !== sessionId) {
      return { success: false, reason: 'SESSION_MISMATCH' };
    }
    this.activeSession.approvalToken = null;
    this.activeSession.approvalTokenExpiresAt = null;
    this.activeSession.isSubmitting = false;

    if (this.activeSession.state !== STATES.CHECKOUT_ABORTED) {
      this.transitionState(sessionId, STATES.CHECKOUT_ABORTED);
    }
    return { success: true, reason };
  }

  acquireSubmissionLock(sessionId, approvalToken) {
    if (!this.activeSession || this.activeSession.checkoutSessionId !== sessionId) {
      return { allowed: false, reason: 'SESSION_MISMATCH' };
    }
    if (this.activeSession.isSubmitting) {
      return { allowed: false, reason: 'CONCURRENT_SUBMISSION_BLOCKED' };
    }
    if (this.activeSession.state !== STATES.PURCHASE_APPROVED) {
      return { allowed: false, reason: 'STATE_NOT_APPROVED', state: this.activeSession.state };
    }
    if (!this.activeSession.approvalToken || this.activeSession.approvalToken !== approvalToken) {
      return { allowed: false, reason: 'INVALID_APPROVAL_TOKEN' };
    }
    if (this.activeSession.tokenConsumed) {
      return { allowed: false, reason: 'TOKEN_ALREADY_CONSUMED' };
    }
    if (Date.now() > this.activeSession.approvalTokenExpiresAt) {
      return { allowed: false, reason: 'APPROVAL_TOKEN_EXPIRED' };
    }

    this.activeSession.isSubmitting = true;
    this.activeSession.tokenConsumed = true;
    this.transitionState(sessionId, STATES.PREFLIGHT_VERIFIED);

    return { allowed: true };
  }

  recordIntentPrepared(sessionId) {
    this.transitionState(sessionId, STATES.INTENT_PREPARED);
  }

  recordDispatchMayHaveStarted(sessionId) {
    this.transitionState(sessionId, STATES.DISPATCH_MAY_HAVE_STARTED);
  }

  recordDispatchCallReturned(sessionId) {
    this.transitionState(sessionId, STATES.DISPATCH_CALL_RETURNED);
  }

  recordTerminalOutcome(sessionId, outcome, details = {}) {
    if (!this.activeSession || this.activeSession.checkoutSessionId !== sessionId) return;

    this.activeSession.terminalOutcome = outcome;
    this.activeSession.isSubmitting = false;

    if (outcome === 'CONFIRMED') {
      this.transitionState(sessionId, STATES.ORDER_CONFIRMED);
      this.archivedSessions.set(sessionId, { ...this.activeSession });
      this.activeSession = null;
    } else if (outcome === 'UNCERTAIN') {
      this.transitionState(sessionId, STATES.SUBMISSION_UNCERTAIN);
      this.lockedAsins.add(this.activeSession.targetAsin);
      this.uncertainSessions.set(sessionId, { ...this.activeSession, uncertaintyDetails: details });
      this.activeSession = null;
    } else if (outcome === 'ABORTED') {
      this.transitionState(sessionId, STATES.CHECKOUT_ABORTED, details);
      this.activeSession.approvalToken = null;
      this.archivedSessions.set(sessionId, { ...this.activeSession, abortDetails: details });
      this.activeSession = null;
    } else {
      this.transitionState(sessionId, STATES.CHECKOUT_FAILED);
      this.activeSession.approvalToken = null;
      this.archivedSessions.set(sessionId, { ...this.activeSession, failDetails: details });
      this.activeSession = null;
    }
  }

  reconcileUncertainSession(sessionId, resolution, details = {}) {
    const uncertain = this.uncertainSessions.get(sessionId);
    if (!uncertain) return false;

    if (resolution === 'VERIFIED_PLACED') {
      if (!details.orderId || !/\b\d{3}-\d{7}-\d{7}\b/.test(details.orderId)) {
        throw new Error('VALID_AMAZON_ORDER_ID_REQUIRED_FOR_VERIFIED_PLACED');
      }
      uncertain.reconciliation = { resolution, orderId: details.orderId, timestamp: Date.now() };
      this.lockedAsins.delete(uncertain.targetAsin);
      this.archivedSessions.set(sessionId, uncertain);
      this.uncertainSessions.delete(sessionId);
      return true;
    }

    if (resolution === 'USER_ACCEPTED_DUPLICATE_RISK') {
      if (!details.userAcceptedRisk) {
        throw new Error('USER_ACCEPTED_RISK_ACKNOWLEDGEMENT_REQUIRED');
      }
      uncertain.reconciliation = { resolution, acknowledgedAt: Date.now() };
      this.lockedAsins.delete(uncertain.targetAsin);
      this.archivedSessions.set(sessionId, uncertain);
      this.uncertainSessions.delete(sessionId);
      return true;
    }

    if (resolution === 'STILL_UNCERTAIN') {
      uncertain.reconciliation = { resolution, checkedAt: Date.now() };
      return true;
    }

    if (resolution === 'RECONCILED_NOT_PLACED') {
      uncertain.reconciliation = { resolution: 'USER_ACCEPTED_DUPLICATE_RISK', fallback: true };
      this.lockedAsins.delete(uncertain.targetAsin);
      this.archivedSessions.set(sessionId, uncertain);
      this.uncertainSessions.delete(sessionId);
      return true;
    }

    return false;
  }
}

// ============================================================================
// 6. CHECKOUT DURABLE LEDGER
// ============================================================================

/**
 * Append-only JSONL durable ledger with async queue serialization,
 * circuit-breaker error handling, dedicated emergency pre-click aborts,
 * corrupt-tail quarantine, and strict startup crash recovery.
 */
class CheckoutLedger {
  constructor(ledgerPath, options = {}) {
    this.ledgerPath = ledgerPath;
    this.writeQueue = Promise.resolve();
    this.circuitBreakerTripped = false;
    this.circuitBreakerError = null;
    this.isLocked = false;
    this.lockReason = null;
    this.seq = 0;
    this.fsyncHook = options.fsyncHook || null;
    this.emergencyHook = options.emergencyHook || null;
  }

  lock(reason) {
    this.isLocked = true;
    this.lockReason = reason;
  }

  async append(event) {
    return new Promise((resolve, reject) => {
      this.writeQueue = this.writeQueue.then(async () => {
        if (this.circuitBreakerTripped) {
          throw new Error(`CIRCUIT_BREAKER_TRIPPED: ${this.circuitBreakerError}`);
        }
        if (this.isLocked) {
          throw new Error(`LEDGER_LOCKED: ${this.lockReason}`);
        }

        this.seq += 1;
        const entry = {
          seq: this.seq,
          ...event,
          loggedAt: Date.now()
        };

        const line = JSON.stringify(entry) + '\n';

        try {
          const dir = path.dirname(this.ledgerPath);
          if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
          }

          const handle = await fs.promises.open(this.ledgerPath, 'a');
          try {
            await handle.write(line);
            if (this.fsyncHook) {
              await this.fsyncHook(entry);
            } else {
              await handle.sync();
            }
          } finally {
            await handle.close();
          }

          resolve(entry);
        } catch (err) {
          this.circuitBreakerTripped = true;
          this.circuitBreakerError = err.message;
          reject(err);
        }
      }).catch(err => {
        reject(err);
      });
    });
  }

  /**
   * Dedicated emergency pre-click abort append.
   * Bypasses the tripped normal queue, but requires physical disk flush to claim durable proof.
   * If this write fails or throws, durable proof does NOT exist; ledger locks permanently.
   */
  async appendEmergencyAbort({ sessionId, reason, clickInvoked = false }) {
    if (this.isLocked) {
      return { success: false, error: new Error(`LEDGER_LOCKED: ${this.lockReason}`) };
    }

    this.seq += 1;
    const entry = {
      seq: this.seq,
      type: 'DISPATCH_ABORTED_PRE_CLICK',
      sessionId,
      reason,
      clickInvoked: false,
      loggedAt: Date.now()
    };

    const line = JSON.stringify(entry) + '\n';

    try {
      if (this.emergencyHook) {
        await this.emergencyHook(entry);
      }

      const dir = path.dirname(this.ledgerPath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const handle = await fs.promises.open(this.ledgerPath, 'a');
      try {
        await handle.write(line);
        await handle.sync();
      } finally {
        await handle.close();
      }

      return { success: true, entry };
    } catch (err) {
      this.lock('EMERGENCY_ABORT_PERSISTENCE_FAILED');
      return { success: false, error: err };
    }
  }

  async executeDispatchBoundary({ sessionId, guard, performClick }) {
    if (!guard.activeSession || guard.activeSession.checkoutSessionId !== sessionId) {
      throw new Error('SESSION_MISMATCH');
    }

    // CHECKPOINT 1: INTENT_PREPARED
    try {
      await this.append({
        type: 'INTENT_PREPARED',
        sessionId
      });
    } catch (intentErr) {
      guard.recordTerminalOutcome(sessionId, 'ABORTED', {
        reason: 'INTENT_PERSISTENCE_FAILED',
        error: intentErr.message
      });
      throw new Error(`INTENT_PERSISTENCE_FAILED: ${intentErr.message}`);
    }
    guard.recordIntentPrepared(sessionId);

    // CHECKPOINT 2: DISPATCH_MAY_HAVE_STARTED (Point of No Return)
    try {
      await this.append({
        type: 'DISPATCH_MAY_HAVE_STARTED',
        sessionId
      });
      guard.recordDispatchMayHaveStarted(sessionId);
    } catch (writeErr) {
      // INVARIANT: Click function must NEVER be called if boundary write fails!
      const emergencyRes = await this.appendEmergencyAbort({
        sessionId,
        reason: 'BOUNDARY_WRITE_FAILED',
        clickInvoked: false
      });

      if (emergencyRes.success) {
        // Durable pre-click abort confirmed on disk
        guard.recordTerminalOutcome(sessionId, 'ABORTED', {
          provenPreClickAbort: true,
          reason: 'BOUNDARY_WRITE_FAILED'
        });
      } else {
        // Emergency write ALSO failed: status on disk is ambiguous!
        // MUST classify as SUBMISSION_UNCERTAIN and lock ASIN!
        guard.recordTerminalOutcome(sessionId, 'UNCERTAIN', {
          reason: 'AMBIGUOUS_BOUNDARY_PERSISTENCE_FAILURE'
        });
      }

      throw new Error(`BOUNDARY_WRITE_FAILED: ${writeErr.message}`);
    }

    // CHECKPOINT 3: Click dispatch
    // INVARIANT: No selector re-query or fallback after boundary record!
    try {
      if (typeof performClick === 'function') {
        await performClick();
      } else {
        throw new Error('NO_CLICK_EXECUTOR_AVAILABLE');
      }
    } catch (clickErr) {
      guard.recordTerminalOutcome(sessionId, 'UNCERTAIN', {
        reason: 'CLICK_INVOCATION_FAILED',
        error: clickErr.message
      });

      try {
        await this.append({
          type: 'SUBMISSION_UNCERTAIN',
          sessionId,
          reason: 'CLICK_INVOCATION_FAILED',
          error: clickErr.message
        });
      } catch (appendErr) {
        this.lock('POST_DISPATCH_LEDGER_APPEND_FAILED');
      }

      throw clickErr;
    }

    // CHECKPOINT 4: DISPATCH_CALL_RETURNED
    try {
      await this.append({
        type: 'DISPATCH_CALL_RETURNED',
        sessionId
      });
    } catch (retErr) {
      this.lock('DISPATCH_RETURN_PERSISTENCE_FAILED');
      guard.recordTerminalOutcome(sessionId, 'UNCERTAIN', {
        reason: 'DISPATCH_RETURN_PERSISTENCE_FAILED',
        error: retErr.message
      });
      throw new Error(`DISPATCH_RETURN_PERSISTENCE_FAILED: ${retErr.message}`);
    }
    guard.recordDispatchCallReturned(sessionId);

    return { success: true };
  }

  async recoverOnStartup() {
    if (!fs.existsSync(this.ledgerPath)) {
      return { status: 'CLEAN', sessions: [] };
    }

    const content = await fs.promises.readFile(this.ledgerPath, 'utf8');
    const lines = content.split('\n');
    const parsedEvents = [];
    let corruptTail = null;
    let lastSeq = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const event = JSON.parse(line);

        // Validate required fields on every event
        if (!event.seq || typeof event.seq !== 'number' || !event.type || typeof event.type !== 'string' || !event.loggedAt) {
          this.lock('MALFORMED_EVENT_SCHEMA');
          return { status: 'LOCKED', reason: 'MALFORMED_EVENT_SCHEMA', lineIndex: i };
        }

        // Validate strictly monotonic sequence numbers
        if (event.seq <= lastSeq) {
          this.lock('NON_MONOTONIC_SEQUENCE_NUMBER');
          return { status: 'LOCKED', reason: 'NON_MONOTONIC_SEQUENCE_NUMBER', lineIndex: i, seq: event.seq, lastSeq };
        }
        lastSeq = event.seq;

        parsedEvents.push(event);
      } catch (err) {
        const remainingNonEmpty = lines.slice(i + 1).filter(l => l.trim().length > 0);
        if (remainingNonEmpty.length === 0) {
          corruptTail = line;
          const corruptPath = this.ledgerPath.replace(/\.jsonl$/, `.corrupt.${Date.now()}.log`);
          await fs.promises.writeFile(corruptPath, line, 'utf8');
          break;
        } else {
          this.lock('CORRUPT_INTERMEDIATE_LEDGER_LINE');
          return {
            status: 'LOCKED',
            reason: 'CORRUPT_INTERMEDIATE_LEDGER_LINE',
            lineIndex: i
          };
        }
      }
    }

    const sessionEvents = new Map();
    for (const event of parsedEvents) {
      if (event.sessionId) {
        if (!sessionEvents.has(event.sessionId)) {
          sessionEvents.set(event.sessionId, []);
        }
        sessionEvents.get(event.sessionId).push(event);
      }
    }

    const assessments = [];

    for (const [sessionId, events] of sessionEvents.entries()) {
      const eventTypes = events.map(e => e.type);
      const hasIntent = eventTypes.includes('INTENT_PREPARED');
      const hasDispatchMayHaveStarted = eventTypes.includes('DISPATCH_MAY_HAVE_STARTED');
      const hasDispatchReturned = eventTypes.includes('DISPATCH_CALL_RETURNED');
      const hasOrderConfirmed = eventTypes.includes('ORDER_CONFIRMED');
      const abortEvents = events.filter(e => e.type === 'DISPATCH_ABORTED_PRE_CLICK');

      let assessmentStatus = 'UNKNOWN';
      let mustReconcileManually = false;
      let canAutoRetry = false;

      // Contradictory evidence detection:
      const hasContradictoryDispatch = abortEvents.length > 0 && (hasDispatchReturned || hasOrderConfirmed);
      const hasDuplicateAborts = abortEvents.length > 1;
      const validPreClickAbort = abortEvents.find(e => e.clickInvoked === false && e.sessionId === sessionId && e.reason);

      if (hasContradictoryDispatch || hasDuplicateAborts) {
        assessmentStatus = 'SUBMISSION_UNCERTAIN';
        mustReconcileManually = true;
        canAutoRetry = false;
      } else if (hasOrderConfirmed) {
        assessmentStatus = 'ORDER_CONFIRMED';
      } else if (validPreClickAbort) {
        const abortIdx = events.indexOf(validPreClickAbort);
        const boundaryIdx = eventTypes.indexOf('DISPATCH_MAY_HAVE_STARTED');
        const intentIdx = eventTypes.indexOf('INTENT_PREPARED');

        if (abortIdx > boundaryIdx || (boundaryIdx === -1 && abortIdx > intentIdx)) {
          assessmentStatus = 'CHECKOUT_ABORTED';
          canAutoRetry = true;
        } else {
          assessmentStatus = 'SUBMISSION_UNCERTAIN';
          mustReconcileManually = true;
          canAutoRetry = false;
        }
      } else if (hasDispatchMayHaveStarted || hasDispatchReturned) {
        assessmentStatus = 'SUBMISSION_UNCERTAIN';
        mustReconcileManually = true;
        canAutoRetry = false;
      } else if (hasIntent) {
        assessmentStatus = 'CHECKOUT_ABORTED';
        canAutoRetry = true;
      } else {
        assessmentStatus = events[events.length - 1].type;
      }

      assessments.push({
        sessionId,
        status: assessmentStatus,
        mustReconcileManually,
        canAutoRetry,
        lastEventType: events[events.length - 1].type
      });
    }

    try {
      await this.append({
        type: 'RECOVERY_ASSESSMENT',
        assessments,
        corruptTailQuarantined: !!corruptTail
      });
    } catch (writeErr) {
      this.lock('RECOVERY_ASSESSMENT_PERSISTENCE_FAILED');
      return {
        status: 'LOCKED',
        reason: 'RECOVERY_ASSESSMENT_PERSISTENCE_FAILED',
        assessments
      };
    }

    return {
      status: 'RECOVERED',
      assessments,
      corruptTailQuarantined: !!corruptTail
    };
  }
}

// ============================================================================
// 7. EXPORTS
// ============================================================================

module.exports = {
  ReviewEvidenceEvaluator,
  PurchaseSnapshotExtractor,
  CheckoutSessionGuard,
  CheckoutLedger,

  toIntegerPaise,
  computeCanonicalString,
  computeCanonicalChecksum,
  verifySnapshotChecksum,
  STATES,
  TERMINAL_STATES,
  LEGAL_TRANSITIONS,
  CANONICAL_FIELDS
};
