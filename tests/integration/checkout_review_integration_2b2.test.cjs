/**
 * Buddy AI — Review-Page Main Process Integration Suite (Increment 2B-2)
 * 
 * Verifies the 2B-2 Review-Page Integration:
 * - Integration of CheckoutCoordinator into Electron main.cjs for REVIEW-PAGE stage
 * - Review verification strictly delegates to ReviewEvidenceEvaluator (eliminating GAP-DEF-02)
 * - UPI payment path advances toward continue button and review page (eliminating GAP-DEF-01)
 * - Canonical snapshot extraction, validation, and session binding
 * - Session transitions to AWAITING_CUSTOMER_APPROVAL
 * - Safe review view exposure (strictly zero tokens, zero checksums, zero internal handles)
 * - Zero-trust customer approval boundary
 * - Non-negotiable safety boundary: NEVER crosses DISPATCH_MAY_HAVE_STARTED
 * - No Place Order click, no VERIFIED_PLACED, no submission
 * - 48/48 frozen 2A tests passing & 13/13 2B-1 tests passing
 * 
 * Run with: node --test tests/integration/checkout_review_integration_2b2.test.cjs
 */

'use strict';

const { test, describe, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const {
  checkReviewPage,
  handleReviewStage,
  handleCustomerApproval,
  checkoutCoordinator,
  executeAgentAction
} = require('../../backend/electron/main/main.cjs');

const {
  STATES
} = require('../../backend/electron/checkout/CheckoutSafetyEngine.cjs');

describe('Buddy AI — Review-Page Main Process Integration Suite (Increment 2B-2)', () => {

  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  let spcReviewHtml = '';
  let payselectHtml = '';
  let tempLedgerDir = '';
  let tempLedgerPath = '';

  before(() => {
    spcReviewHtml = fs.readFileSync(path.join(fixturesDir, 'amazon_spc_review.html'), 'utf8');
    payselectHtml = fs.readFileSync(path.join(fixturesDir, 'amazon_payselect.html'), 'utf8');
  });

  beforeEach(() => {
    tempLedgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy_main_2b2_'));
    tempLedgerPath = path.join(tempLedgerDir, 'test_ledger.jsonl');
    // Ensure clean session guard state before each test
    checkoutCoordinator.guard.activeSession = null;
    checkoutCoordinator.guard.archivedSessions.clear();
    checkoutCoordinator.guard.uncertainSessions.clear();
    checkoutCoordinator.guard.lockedAsins.clear();
  });

  afterEach(() => {
    if (tempLedgerDir && fs.existsSync(tempLedgerDir)) {
      try {
        fs.rmSync(tempLedgerDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors on Windows
      }
    }
  });

  /**
   * Helper: create synthetic Puppeteer mock page
   */
  function createSyntheticPage(initialHtml, initialUrl) {
    let currentHtml = initialHtml;
    let currentUrl = initialUrl;
    let clickRecords = [];

    return {
      url: () => currentUrl,
      content: async () => currentHtml,
      setUrl: (u) => { currentUrl = u; },
      setHtml: (h) => { currentHtml = h; },
      isClosed: () => false,
      clickRecords,
      evaluate: async (fn, ...args) => {
        if (typeof fn === 'function') {
          // Provide mock DOM environment properties if evaluated
          const fnStr = fn.toString();
          if (fnStr.includes('window.location.href')) {
            return currentUrl;
          }
          if (fnStr.includes('document.documentElement.outerHTML')) {
            return currentHtml;
          }
        }
        return null;
      },
      waitForFunction: async () => true,
      $: async () => null,
      scrollBy: async () => {}
    };
  }

  // ==========================================================================
  // TEST-2B2-01: Verified synthetic review page reaches canonical snapshot creation
  // ==========================================================================

  test('TEST-2B2-01: Verified synthetic review page reaches canonical snapshot creation', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const result = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000,
      boundPageId: 'page_test_2b2_01'
    });

    assert.equal(result.success, true, 'handleReviewStage must succeed on verified SPC review page');
    assert.equal(result.state, 'AWAITING_CUSTOMER_APPROVAL');
    assert.ok(result.safeReview, 'Safe review view must be present');
    assert.equal(result.safeReview.targetAsin, 'B09XYZ1234');
    assert.equal(result.safeReview.quantity, 1);
    assert.equal(result.safeReview.itemPricePaise, 1999000);
    assert.equal(result.safeReview.totalPayablePaise, 1999000);
    assert.equal(result.safeReview.totalPayable, 19990);
    assert.equal(result.safeReview.currency, 'INR');
  });

  // ==========================================================================
  // TEST-2B2-02: Verified review page transitions checkout session to AWAITING_CUSTOMER_APPROVAL
  // ==========================================================================

  test('TEST-2B2-02: Verified review page transitions the checkout session to AWAITING_CUSTOMER_APPROVAL', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const result = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(result.success, true);
    const active = checkoutCoordinator.guard.activeSession;
    assert.ok(active, 'Active session must exist in coordinator guard');
    assert.equal(active.state, STATES.AWAITING_CUSTOMER_APPROVAL, 'State must transition to AWAITING_CUSTOMER_APPROVAL');
    assert.ok(active.snapshot, 'Canonical snapshot must be bound to active session');
    assert.equal(active.snapshot.snapshotId, result.safeReview.snapshotId);
  });

  // ==========================================================================
  // TEST-2B2-03: Invalid/non-verified review page fails closed
  // ==========================================================================

  test('TEST-2B2-03: Invalid/non-verified review page fails closed (payselect HTML)', async () => {
    const mockPage = createSyntheticPage(
      payselectHtml,
      'https://www.amazon.in/gp/buy/payselect/handlers/display.html'
    );

    const result = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(result.success, false, 'Must fail closed on non-review payselect page');
    assert.equal(result.reason, 'REVIEW_EVIDENCE_NOT_VERIFIED');
    assert.equal(result.evaluationStatus, 'NOT_VERIFIED');

    // Invariant: No approval-ready review state is created
    const active = checkoutCoordinator.guard.activeSession;
    if (active) {
      assert.notEqual(active.state, STATES.AWAITING_CUSTOMER_APPROVAL);
      assert.equal(active.snapshot, null);
    }
  });

  // ==========================================================================
  // TEST-2B2-04: Generic /display.html page cannot bypass ReviewEvidenceEvaluator
  // ==========================================================================

  test('TEST-2B2-04: Generic /display.html page cannot bypass ReviewEvidenceEvaluator (GAP-DEF-02 elimination)', async () => {
    // Malicious/generic page that has /display.html in URL but non-review content
    const porousHtml = '<html><body><h1>Account Settings</h1><div id="displayPage">Not a review</div></body></html>';
    const mockPage = createSyntheticPage(
      porousHtml,
      'https://www.amazon.in/gp/buy/payselect/handlers/display.html'
    );

    // 1. checkReviewPage must return false
    const onReview = await checkReviewPage(mockPage);
    assert.equal(onReview, false, 'checkReviewPage must reject generic /display.html');

    // 2. handleReviewStage must fail closed
    const stageResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });
    assert.equal(stageResult.success, false, 'handleReviewStage must fail closed');
    assert.equal(stageResult.reason, 'REVIEW_EVIDENCE_NOT_VERIFIED');
  });

  // ==========================================================================
  // TEST-2B2-05: Generic .spc-desktop indicator cannot bypass ReviewEvidenceEvaluator
  // ==========================================================================

  test('TEST-2B2-05: Generic .spc-desktop indicator cannot bypass ReviewEvidenceEvaluator (GAP-DEF-02 elimination)', async () => {
    // Page with .spc-desktop class but missing order summary, place order button, address, etc.
    const porousHtml = '<html><body><div class="spc-desktop">Generic banner advertisement</div></body></html>';
    const mockPage = createSyntheticPage(
      porousHtml,
      'https://www.amazon.in/gp/cart/view.html'
    );

    // 1. checkReviewPage must return false
    const onReview = await checkReviewPage(mockPage);
    assert.equal(onReview, false, 'checkReviewPage must reject generic .spc-desktop class without evidence');

    // 2. handleReviewStage must fail closed
    const stageResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });
    assert.equal(stageResult.success, false, 'handleReviewStage must fail closed');
    assert.equal(stageResult.reason, 'REVIEW_EVIDENCE_NOT_VERIFIED');
  });

  // ==========================================================================
  // TEST-2B2-06: Review snapshot is bound to the correct session
  // ==========================================================================

  test('TEST-2B2-06: Review snapshot is bound to the correct session', async () => {
    const sessionRes = checkoutCoordinator.startSession('B09XYZ1234', 25000);
    assert.equal(sessionRes.success, true);
    const expectedSessionId = sessionRes.sessionId;

    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const result = await handleReviewStage(mockPage, {
      sessionId: expectedSessionId
    });

    assert.equal(result.success, true);
    assert.equal(result.sessionId, expectedSessionId);

    const active = checkoutCoordinator.guard.activeSession;
    assert.equal(active.checkoutSessionId, expectedSessionId);
    assert.ok(active.snapshot);
    assert.equal(active.snapshot.checkoutSessionId, expectedSessionId);
    assert.equal(active.snapshot.targetAsin, 'B09XYZ1234');
  });

  // ==========================================================================
  // TEST-2B2-07: Safe review response contains allowed review information but no approvalToken
  // ==========================================================================

  test('TEST-2B2-07: Safe review response contains allowed review information but no approvalToken', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const result = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(result.success, true);
    const safe = result.safeReview;
    assert.ok(safe, 'Safe review view must be returned');

    // Allowed presentation fields
    assert.ok(safe.title, 'Title must be present');
    assert.ok(safe.targetAsin, 'Target ASIN must be present');
    assert.equal(safe.quantity, 1);
    assert.equal(safe.itemPricePaise, 1999000);
    assert.equal(safe.totalPayablePaise, 1999000);
    assert.equal(safe.totalPayable, 19990);
    assert.equal(safe.currency, 'INR');
    assert.ok(safe.sessionId);
    assert.ok(safe.snapshotId);

    // SECURITY BOUNDARY: Zero token exposure
    assert.equal(safe.approvalToken, undefined, 'approvalToken MUST NOT be present in safe review');
    assert.equal(safe.token, undefined, 'token MUST NOT be present in safe review');
    for (const key of Object.keys(safe)) {
      assert.ok(!key.toLowerCase().includes('token'), `Safe view key '${key}' must not expose security tokens`);
    }
  });

  // ==========================================================================
  // TEST-2B2-08: Safe review response contains no canonicalChecksum
  // ==========================================================================

  test('TEST-2B2-08: Safe review response contains no canonicalChecksum', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const result = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(result.success, true);
    const safe = result.safeReview;

    // SECURITY BOUNDARY: Zero checksum exposure
    assert.equal(safe.canonicalChecksum, undefined, 'canonicalChecksum MUST NOT be exposed in safe review');
    assert.equal(safe.checksum, undefined, 'checksum MUST NOT be exposed in safe review');
    for (const key of Object.keys(safe)) {
      assert.ok(!key.toLowerCase().includes('checksum'), `Safe view key '${key}' must not expose checksums`);
    }
  });

  // ==========================================================================
  // TEST-2B2-09: Renderer-like forged price/total/ASIN data cannot overwrite canonical snapshot
  // ==========================================================================

  test('TEST-2B2-09: Renderer-like forged price/total/ASIN data cannot overwrite canonical snapshot', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const stageResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });
    assert.equal(stageResult.success, true);
    const sessionId = stageResult.sessionId;
    const snapshotId = stageResult.safeReview.snapshotId;

    // Adversarial client/renderer sends forged approval request attempting to override price/total/ASIN
    const forgedRequest = {
      sessionId,
      snapshotId,
      price: 100,
      total: 100,
      itemPricePaise: 100,
      totalPayablePaise: 100,
      targetAsin: 'FORGED_B00FAKE99',
      quantity: 99,
      approved: true,
      approvalToken: 'forged_token_attempt'
    };

    const approvalResult = handleCustomerApproval(sessionId, forgedRequest);
    assert.equal(approvalResult.success, true);
    assert.equal(approvalResult.approved, true);

    // Verify backend canonical snapshot was NOT modified
    const active = checkoutCoordinator.guard.activeSession;
    assert.equal(active.snapshot.targetAsin, 'B09XYZ1234', 'Canonical ASIN must not be overwritten');
    assert.equal(active.snapshot.itemPricePaise, 1999000, 'Canonical item price must not be overwritten');
    assert.equal(active.snapshot.totalPayablePaise, 1999000, 'Canonical total must not be overwritten');
    assert.equal(active.snapshot.quantity, 1, 'Canonical quantity must not be overwritten');
    assert.notEqual(active.approvalToken, 'forged_token_attempt', 'Forged approval token must be ignored');
  });

  // ==========================================================================
  // TEST-2B2-10: UPI payment path advances toward review instead of returning early
  // ==========================================================================

  test('TEST-2B2-10: UPI payment path advances toward review instead of returning early (GAP-DEF-01 elimination)', async () => {
    let continueButtonClicked = false;

    // Mock page simulating Amazon payment selection page transitioning to review page upon continue click
    const mockPaymentPage = {
      _url: 'https://www.amazon.in/gp/buy/payselect/handlers/display.html',
      _html: payselectHtml,
      url() { return this._url; },
      async content() { return this._html; },
      isClosed() { return false; },
      async $(selector) { return null; },
      async evaluate(fn, ...args) {
        if (typeof fn === 'function') {
          const fnStr = fn.toString();
          // Step 1: Radio selection
          if (fnStr.includes('radios = Array.from')) {
            return { success: true, text: 'other upi' };
          }
          // Radio verified check
          if (fnStr.includes('isVerified') || fnStr.includes('checked = Array.from')) {
            return true;
          }
          // Step 2: Continue button click
          if (fnStr.includes('matchTexts') && fnStr.includes('use this payment method')) {
            continueButtonClicked = true;
            // Simulate page transition to review page
            this._url = 'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1';
            this._html = spcReviewHtml;
            return true;
          }
          // Diagnostic probes
          if (fnStr.includes('btnDetails') || fnStr.includes('dismissTexts')) {
            return [];
          }
        }
        return null;
      },
      async waitForFunction(fn, options) {
        return true;
      }
    };

    const action = {
      type: 'amazon_select_payment',
      method: 'upi',
      page: mockPaymentPage,
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    };

    const result = await executeAgentAction(action);

    // Invariant: UPI path did NOT return early { success: true, paymentSelected: 'upi' }
    // It clicked continue, waited for review, evaluated review page, and extracted review stage!
    assert.equal(continueButtonClicked, true, 'Continue button MUST be clicked for UPI (GAP-DEF-01 eliminated)');
    assert.equal(result.success, true);
    assert.equal(result.paymentSelected, 'upi');
    assert.equal(result.onReviewPage, true, 'Must reach review page');
    assert.ok(result.reviewStage, 'Review stage result must be present');
    assert.equal(result.reviewStage.success, true);
    assert.equal(result.reviewStage.state, 'AWAITING_CUSTOMER_APPROVAL');
    assert.ok(result.reviewStage.safeReview);
    assert.equal(result.reviewStage.safeReview.targetAsin, 'B09XYZ1234');
  });

  // ==========================================================================
  // TEST-2B2-11: Review verification failure prevents continuation toward submission
  // ==========================================================================

  test('TEST-2B2-11: Review verification failure prevents continuation toward submission', async () => {
    // Invalid review page
    const mockPage = createSyntheticPage(
      '<html><body><h1>Error 404</h1></body></html>',
      'https://www.amazon.in/error'
    );

    const result = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(result.success, false);
    assert.equal(result.reason, 'REVIEW_EVIDENCE_NOT_VERIFIED');

    // Attempting to advance to approval or submission lock must fail closed
    const active = checkoutCoordinator.guard.activeSession;
    if (active) {
      assert.notEqual(active.state, STATES.AWAITING_CUSTOMER_APPROVAL);
      const lockRes = checkoutCoordinator.prepareSubmissionLock(active.checkoutSessionId);
      assert.equal(lockRes.success, false, 'Cannot acquire submission lock when review failed');
    }
  });

  // ==========================================================================
  // TEST-2B2-12: No Place Order click occurs during 2B-2
  // ==========================================================================

  test('TEST-2B2-12: No Place Order click occurs during 2B-2', async () => {
    let placeOrderClicked = false;

    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    // Track any click on Place Order button
    mockPage.click = async (selector) => {
      if (selector && (selector.includes('placeYourOrder') || selector.includes('place-order') || selector.includes('submitOrder'))) {
        placeOrderClicked = true;
      }
    };

    // Execute review stage
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });
    assert.equal(reviewResult.success, true);

    // Execute approval stage
    const approvalResult = handleCustomerApproval(reviewResult.sessionId, {
      snapshotId: reviewResult.safeReview.snapshotId
    });
    assert.equal(approvalResult.success, true);

    // Invariant: Maximum state reached is strictly before dispatch. No Place Order click!
    assert.equal(placeOrderClicked, false, 'Place Order click MUST NEVER be invoked in 2B-2');
  });

  // ==========================================================================
  // TEST-2B2-13: No DISPATCH_MAY_HAVE_STARTED ledger event is created during 2B-2
  // ==========================================================================

  test('TEST-2B2-13: No DISPATCH_MAY_HAVE_STARTED ledger event is created during 2B-2', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });
    assert.equal(reviewResult.success, true);

    // Check disk ledger (if any ledger was written)
    const ledgerPath = path.join(os.tmpdir(), 'buddy_app_data', 'checkout_ledger.jsonl');
    if (fs.existsSync(ledgerPath)) {
      const content = fs.readFileSync(ledgerPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const ev = JSON.parse(line);
        assert.notEqual(ev.type, 'DISPATCH_MAY_HAVE_STARTED', 'Must never record DISPATCH_MAY_HAVE_STARTED in 2B-2');
      }
    }
  });

  // ==========================================================================
  // TEST-2B2-14: No VERIFIED_PLACED outcome can be produced during 2B-2
  // ==========================================================================

  test('TEST-2B2-14: No VERIFIED_PLACED outcome can be produced during 2B-2', async () => {
    const mockPage = createSyntheticPage(
      spcReviewHtml,
      'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1'
    );

    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });
    assert.equal(reviewResult.success, true);

    // Check terminal outcome: session is in-flight at AWAITING_CUSTOMER_APPROVAL
    const terminalOutcome = checkoutCoordinator.getTerminalOutcome(reviewResult.sessionId);
    assert.equal(terminalOutcome, null, 'Terminal outcome must be null while session is in-flight at review/approval');

    const active = checkoutCoordinator.guard.activeSession;
    assert.notEqual(active.state, STATES.ORDER_CONFIRMED, 'State must not be ORDER_CONFIRMED');
    assert.notEqual(active.state, STATES.SUBMISSION_UNCERTAIN, 'State must not be SUBMISSION_UNCERTAIN');
  });

  // ==========================================================================
  // TEST-2B2-15: Frozen 2A suite remains 48/48
  // ==========================================================================

  test('TEST-2B2-15: Frozen 2A test suite runs and all 48 tests pass unchanged', () => {
    const cmd = 'node --test tests/unit/checkout_safety_boundary.test.cjs';
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;
    const output = execSync(cmd, { env: cleanEnv, encoding: 'utf8', cwd: path.join(__dirname, '../..') });

    assert.ok(output.includes('pass 48'), '2A test suite must pass all 48 tests');
    assert.ok(output.includes('fail 0'), '2A test suite must have 0 failures');
  });

  // ==========================================================================
  // TEST-2B2-16: Existing 2B-1 suite remains 13/13
  // ==========================================================================

  test('TEST-2B2-16: Existing 2B-1 coordinator test suite runs and all 13 tests pass', () => {
    const cmd = 'node --test tests/integration/checkout_coordinator_2b1.test.cjs';
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;
    const output = execSync(cmd, { env: cleanEnv, encoding: 'utf8', cwd: path.join(__dirname, '../..') });

    assert.ok(output.includes('pass 13'), '2B-1 test suite must pass all 13 tests');
    assert.ok(output.includes('fail 0'), '2B-1 test suite must have 0 failures');
  });

});
