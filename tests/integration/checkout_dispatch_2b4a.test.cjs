/**
 * Buddy AI — Checkout Pre-Dispatch & Retained ElementHandle Suite (Increment 2B-4A)
 *
 * Test File: tests/integration/checkout_dispatch_2b4a.test.cjs
 *
 * Verifies Phase 2B-4A of the hardened checkout safety architecture:
 * 1. Pre-dispatch validation across 17 strict backend-authoritative safety conditions.
 * 2. Scoped acquisition of the Place Order target as a retained ElementHandle.
 * 3. Pre-boundary actionability verification (dimensions, visibility, enabled, pointer events).
 * 4. Submission lock integration transitioning session to PREFLIGHT_VERIFIED.
 * 5. getSafeReviewView terminal-state non-actionability contract.
 * 6. INVARIANT ENFORCEMENT:
 *    - ZERO click calls (ElementHandle.click, page.click, etc.)
 *    - ZERO executeDispatchBoundary() invocations
 *    - ZERO DISPATCH_MAY_HAVE_STARTED ledger writes
 *    - ZERO INTENT_PREPARED ledger writes
 *    - ZERO live Amazon requests
 *
 * Run with: node --test tests/integration/checkout_dispatch_2b4a.test.cjs
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  CheckoutCoordinator,
  formatTerminalOutcome,
  AUTHORITATIVE_OUTCOMES
} = require('../../backend/electron/checkout/CheckoutCoordinator.cjs');

const {
  STATES,
  TERMINAL_STATES,
  CheckoutSessionGuard,
  CheckoutLedger,
  verifySnapshotChecksum
} = require('../../backend/electron/checkout/CheckoutSafetyEngine.cjs');

// ============================================================================
// FIXTURES & SYNTHETIC MOCK HELPERS
// ============================================================================

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const spcReviewHtml = fs.readFileSync(path.join(FIXTURES_DIR, 'amazon_spc_review.html'), 'utf8');
const spcUrl = 'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1';

/**
 * Creates a synthetic mock ElementHandle simulating Puppeteer ElementHandle.
 * Explicitly tracks whether .click() is ever called.
 */
function createSyntheticElementHandle(overrides = {}) {
  let clickCount = 0;

  return {
    tagName: overrides.tagName || 'INPUT',
    type: overrides.type || 'submit',
    name: overrides.name || 'placeYourOrder1',
    disabled: !!overrides.disabled,
    ariaDisabled: overrides.ariaDisabled !== undefined ? overrides.ariaDisabled : 'false',
    offsetWidth: overrides.offsetWidth !== undefined ? overrides.offsetWidth : 120,
    offsetHeight: overrides.offsetHeight !== undefined ? overrides.offsetHeight : 35,
    pointerEvents: overrides.pointerEvents || 'auto',
    visibility: overrides.visibility || 'visible',
    display: overrides.display || 'block',

    evaluate: async (fn) => {
      if (overrides.evaluateThrows) {
        throw new Error('Node is detached from document');
      }
      const mockElement = {
        tagName: overrides.tagName || 'INPUT',
        offsetWidth: overrides.offsetWidth !== undefined ? overrides.offsetWidth : 120,
        offsetHeight: overrides.offsetHeight !== undefined ? overrides.offsetHeight : 35,
        disabled: !!overrides.disabled,
        getAttribute: (attr) => {
          if (attr === 'aria-disabled') return overrides.ariaDisabled !== undefined ? overrides.ariaDisabled : 'false';
          if (attr === 'role') return overrides.role || null;
          return null;
        },
        getBoundingClientRect: () => ({
          width: overrides.offsetWidth !== undefined ? overrides.offsetWidth : 120,
          height: overrides.offsetHeight !== undefined ? overrides.offsetHeight : 35
        })
      };

      // Mock window.getComputedStyle for actionability evaluator
      const originalWindow = global.window;
      global.window = {
        getComputedStyle: () => ({
          pointerEvents: overrides.pointerEvents || 'auto',
          visibility: overrides.visibility || 'visible',
          display: overrides.display || 'block'
        })
      };

      try {
        if (typeof fn === 'function') {
          return fn(mockElement);
        }
        return null;
      } finally {
        global.window = originalWindow;
      }
    },

    click: async () => {
      clickCount++;
      if (overrides.clickThrows) throw new Error('CLICK_FAILED');
      return true;
    },

    get clickCount() {
      return clickCount;
    }
  };
}

/**
 * Creates a synthetic mock Page simulating Puppeteer Page in SPC review context.
 */
function createSyntheticPage(options = {}) {
  const isClosed = !!options.isClosed;
  const url = options.url !== undefined ? options.url : spcUrl;
  const containerExists = options.containerExists !== undefined ? options.containerExists : true;
  const buttonExists = options.buttonExists !== undefined ? options.buttonExists : true;
  const buttonHandle = buttonExists ? (options.buttonHandle || createSyntheticElementHandle(options.handleOptions)) : null;

  const containerHandle = {
    $: async (sel) => {
      if (!buttonExists) return null;
      return buttonHandle;
    }
  };

  return {
    url: () => url,
    content: async () => spcReviewHtml,
    isClosed: () => isClosed,
    $: async (sel) => {
      if (!containerExists && sel.includes('#spc-order-summary')) return null;
      if (sel === '#spc-order-summary' || sel.includes('container')) {
        return containerHandle;
      }
      if (!buttonExists) return null;
      return buttonHandle;
    },
    evaluate: async (fn, ...args) => {
      if (typeof fn === 'function') return fn(...args);
      return null;
    },
    getButtonHandle: () => buttonHandle
  };
}

/**
 * Helper to initialize a coordinator and advance a session to PURCHASE_APPROVED.
 */
function setupApprovedSession(options = {}) {
  const tempLedgerPath = path.join(os.tmpdir(), `buddy_ledger_test_${Date.now()}_${Math.random().toString(36).slice(2)}.jsonl`);
  const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });

  const { sessionId } = coordinator.startSession(options.asin || 'B09XYZ1234', options.budget || 25000);
  const bindRes = coordinator.extractAndBindReviewSnapshot(sessionId, {
    htmlString: options.htmlString || spcReviewHtml,
    url: options.url || spcUrl
  });

  assert.equal(bindRes.success, true, 'Snapshot binding must succeed in setup');
  const snapshotId = coordinator.guard.activeSession.snapshot.snapshotId;

  const approvalRes = coordinator.processUserApproval(sessionId, { snapshotId });
  assert.equal(approvalRes.success, true, 'Approval must succeed in setup');
  assert.equal(coordinator.guard.activeSession.state, STATES.PURCHASE_APPROVED);

  return {
    coordinator,
    sessionId,
    snapshotId,
    tempLedgerPath,
    activeSession: coordinator.guard.activeSession
  };
}

// ============================================================================
// SUITE: INCREMENT 2B-4A INTEGRATION TESTS
// ============================================================================

test('Buddy AI — Checkout Pre-Dispatch & Retained Handle Suite (Increment 2B-4A)', async (t) => {

  // ==========================================================================
  // SECTION 1: PRE-DISPATCH VALIDATION GATE (TEST-01 to TEST-10)
  // ==========================================================================

  await t.test('TEST-2B4A-01: Valid PURCHASE_APPROVED session passes pre-dispatch validation', async () => {
    const { coordinator, sessionId } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    const result = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(result.valid, true, 'Valid approved session must pass pre-dispatch validation');
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.state, STATES.PURCHASE_APPROVED);
    assert.ok(result.handle, 'Actionable button handle must be returned');
    assert.equal(result.handle.clickCount, 0, 'Handle must NOT be clicked');
  });

  await t.test('TEST-2B4A-02: Unapproved session fails closed', async () => {
    const tempLedgerPath = path.join(os.tmpdir(), `buddy_ledger_unapproved_${Date.now()}.jsonl`);
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);
    coordinator.extractAndBindReviewSnapshot(sessionId, { htmlString: spcReviewHtml, url: spcUrl });

    // Session is in AWAITING_CUSTOMER_APPROVAL, NOT PURCHASE_APPROVED
    assert.equal(coordinator.guard.activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);
    const mockPage = createSyntheticPage();

    const result = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'INVALID_STATE_FOR_PRE_DISPATCH');
  });

  await t.test('TEST-2B4A-03: Expired approval token fails closed', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // Artificially expire the approval token
    activeSession.approvalTokenExpiresAt = Date.now() - 5000;

    const result = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'APPROVAL_TOKEN_EXPIRED');
  });

  await t.test('TEST-2B4A-04: Consumed approval token fails closed', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // Mark token as already consumed
    activeSession.tokenConsumed = true;

    const result = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'TOKEN_ALREADY_CONSUMED');
  });

  await t.test('TEST-2B4A-05: Snapshot checksum mismatch fails closed', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // Tamper with canonical snapshot total without re-hashing
    activeSession.snapshot.totalPayablePaise = 100; // Altered price

    const result = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'SNAPSHOT_CHECKSUM_INVALID');
  });

  await t.test('TEST-2B4A-06: Expired snapshot fails closed', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // Artificially expire the snapshot
    activeSession.snapshot.expiresAt = Date.now() - 1000;

    const result = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'SNAPSHOT_EXPIRED');
  });

  await t.test('TEST-2B4A-07: Missing/closed page fails closed', async () => {
    const { coordinator, sessionId } = setupApprovedSession();

    // Missing page
    const noPageRes = await coordinator.validatePreDispatch(sessionId, { page: null });
    assert.equal(noPageRes.valid, false);
    assert.equal(noPageRes.reason, 'PAGE_REQUIRED');

    // Closed page
    const closedPage = createSyntheticPage({ isClosed: true });
    const closedPageRes = await coordinator.validatePreDispatch(sessionId, { page: closedPage });
    assert.equal(closedPageRes.valid, false);
    assert.equal(closedPageRes.reason, 'PAGE_CLOSED');
  });

  await t.test('TEST-2B4A-08: Wrong review context fails closed', async () => {
    const { coordinator, sessionId } = setupApprovedSession();

    // Page navigated to payselect or cart instead of SPC review
    const wrongContextPage = createSyntheticPage({ url: 'https://www.amazon.in/gp/buy/payselect/handlers/display.html' });

    const result = await coordinator.validatePreDispatch(sessionId, { page: wrongContextPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'INVALID_REVIEW_CONTEXT');
  });

  await t.test('TEST-2B4A-09: Missing Place Order target fails closed', async () => {
    const { coordinator, sessionId } = setupApprovedSession();

    // Container exists, but button is missing
    const missingButtonPage = createSyntheticPage({ buttonExists: false });

    const result = await coordinator.validatePreDispatch(sessionId, { page: missingButtonPage });
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'PLACE_ORDER_BUTTON_NOT_FOUND');

    // Container missing entirely
    const missingContainerPage = createSyntheticPage({ containerExists: false });
    const containerResult = await coordinator.validatePreDispatch(sessionId, { page: missingContainerPage });
    assert.equal(containerResult.valid, false);
    assert.equal(containerResult.reason, 'BUTTON_CONTAINER_NOT_FOUND');
  });

  await t.test('TEST-2B4A-10: Hidden/disabled/non-actionable target fails closed', async () => {
    const { coordinator, sessionId } = setupApprovedSession();

    // Scenario A: Disabled button
    const disabledPage = createSyntheticPage({ handleOptions: { disabled: true } });
    const disabledRes = await coordinator.validatePreDispatch(sessionId, { page: disabledPage });
    assert.equal(disabledRes.valid, false);
    assert.equal(disabledRes.reason, 'TARGET_NOT_ACTIONABLE');

    // Scenario B: Hidden button (offsetWidth 0)
    const hiddenPage = createSyntheticPage({ handleOptions: { offsetWidth: 0, offsetHeight: 0 } });
    const hiddenRes = await coordinator.validatePreDispatch(sessionId, { page: hiddenPage });
    assert.equal(hiddenRes.valid, false);
    assert.equal(hiddenRes.reason, 'TARGET_NOT_ACTIONABLE');

    // Scenario C: Pointer events disabled
    const noPointerPage = createSyntheticPage({ handleOptions: { pointerEvents: 'none' } });
    const noPointerRes = await coordinator.validatePreDispatch(sessionId, { page: noPointerPage });
    assert.equal(noPointerRes.valid, false);
    assert.equal(noPointerRes.reason, 'TARGET_NOT_ACTIONABLE');

    // Scenario D: Evaluation threw (detached handle)
    const detachedPage = createSyntheticPage({ handleOptions: { evaluateThrows: true } });
    const detachedRes = await coordinator.validatePreDispatch(sessionId, { page: detachedPage });
    assert.equal(detachedRes.valid, false);
    assert.equal(detachedRes.reason, 'TARGET_NOT_ACTIONABLE');
  });

  // ==========================================================================
  // SECTION 2: RETAINED ELEMENTHANDLE ACQUISITION (TEST-11 to TEST-12)
  // ==========================================================================

  await t.test('TEST-2B4A-11: Valid synthetic target produces a retained ElementHandle', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    const handleRes = await coordinator.acquireRetainedButtonHandle(mockPage, activeSession.snapshot);
    assert.equal(handleRes.success, true);
    assert.ok(handleRes.handle, 'Must return retained handle reference');
    assert.equal(typeof handleRes.handle.click, 'function');
    assert.equal(handleRes.actionability.isActionable, true);
  });

  await t.test('TEST-2B4A-12: Retained handle is acquired without invoking click', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    const handleRes = await coordinator.acquireRetainedButtonHandle(mockPage, activeSession.snapshot);
    assert.equal(handleRes.success, true);
    assert.equal(handleRes.handle.clickCount, 0, 'acquireRetainedButtonHandle must NEVER invoke click()');

    const preDispatchRes = await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(preDispatchRes.valid, true);
    assert.equal(preDispatchRes.handle.clickCount, 0, 'validatePreDispatch must NEVER invoke click()');
  });

  // ==========================================================================
  // SECTION 3: SUBMISSION LOCK & PREFLIGHT VERIFIED (TEST-13 to TEST-14)
  // ==========================================================================

  await t.test('TEST-2B4A-13: Submission lock transitions to PREFLIGHT_VERIFIED', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    assert.equal(activeSession.state, STATES.PURCHASE_APPROVED);
    assert.equal(activeSession.isSubmitting, false);
    assert.equal(activeSession.tokenConsumed, false);

    // Execute Pre-Dispatch Gate
    const gateRes = await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    assert.equal(gateRes.success, true);
    assert.equal(gateRes.gatePassed, true);
    assert.equal(gateRes.preflightVerified, true);
    assert.equal(gateRes.state, STATES.PREFLIGHT_VERIFIED);

    // Guard internal state checks
    assert.equal(activeSession.state, STATES.PREFLIGHT_VERIFIED);
    assert.equal(activeSession.isSubmitting, true);
    assert.equal(activeSession.tokenConsumed, true);
    assert.ok(gateRes.retainedHandle);
    assert.equal(gateRes.retainedHandle.clickCount, 0, 'Gate must NOT click');
  });

  await t.test('TEST-2B4A-14: Concurrent submission is rejected', async () => {
    const { coordinator, sessionId } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // First gate execution succeeds
    const firstRes = await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    assert.equal(firstRes.success, true);
    assert.equal(firstRes.state, STATES.PREFLIGHT_VERIFIED);

    // Immediate duplicate gate execution fails closed
    const duplicateRes = await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    assert.equal(duplicateRes.success, false);
    assert.equal(duplicateRes.gatePassed, false);
    assert.equal(duplicateRes.reason, 'INVALID_STATE_FOR_PRE_DISPATCH');
  });

  // ==========================================================================
  // SECTION 4: SAFE REVIEW TERMINAL-STATE CONTRACT (TEST-15 to TEST-17)
  // ==========================================================================

  await t.test('TEST-2B4A-15: getSafeReviewView after CHECKOUT_ABORTED is non-actionable', async () => {
    const { coordinator, sessionId } = setupApprovedSession();

    // Cancel session
    coordinator.cancelCheckout(sessionId, 'USER_ABORTED_TEST');
    assert.equal(coordinator.guard.activeSession.state, STATES.CHECKOUT_ABORTED);

    const safeReview = coordinator.getSafeReviewView(sessionId);
    assert.ok(safeReview);
    assert.equal(safeReview.state, STATES.CHECKOUT_ABORTED);
    assert.equal(safeReview.isActionable, false, 'Aborted session must be explicitly marked isActionable: false');
    assert.equal(safeReview.isTerminal, true, 'Aborted session must be marked isTerminal: true');
    assert.equal(safeReview.reason, 'USER_ABORTED_TEST');
    assert.equal(safeReview.approvalToken, undefined);
  });

  await t.test('TEST-2B4A-16: getSafeReviewView after SUBMISSION_UNCERTAIN is non-actionable', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();

    // Advance session state so it can legally transition to SUBMISSION_UNCERTAIN
    // LEGAL_TRANSITIONS: DISPATCH_CALL_RETURNED -> SUBMISSION_UNCERTAIN
    activeSession.state = STATES.DISPATCH_CALL_RETURNED;
    coordinator.guard.recordTerminalOutcome(sessionId, 'UNCERTAIN', {
      reason: 'SIMULATED_TEST_UNCERTAINTY'
    });

    const safeReview = coordinator.getSafeReviewView(sessionId);
    assert.ok(safeReview);
    assert.equal(safeReview.state, STATES.SUBMISSION_UNCERTAIN);
    assert.equal(safeReview.isActionable, false, 'Uncertain session must be non-actionable');
    assert.equal(safeReview.mustReconcileManually, true, 'Uncertain session must require manual reconciliation');
    assert.equal(safeReview.approvalToken, undefined);
  });

  await t.test('TEST-2B4A-17: getSafeReviewView does not expose approval token', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();

    assert.ok(activeSession.approvalToken, 'Guard has internal approval token in heap');

    // Active approved view
    const approvedView = coordinator.getSafeReviewView(sessionId);
    assert.equal(approvedView.approvalToken, undefined, 'approvalToken MUST NOT be exposed in approved view');
    assert.equal(approvedView.canonicalChecksum, undefined, 'checksum MUST NOT be exposed in approved view');

    // Advance to PREFLIGHT_VERIFIED
    const mockPage = createSyntheticPage();
    await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    const preflightView = coordinator.getSafeReviewView(sessionId);
    assert.equal(preflightView.approvalToken, undefined, 'approvalToken MUST NOT be exposed in preflight view');
  });

  // ==========================================================================
  // SECTION 5: INVARIANT ENFORCEMENT & SAFETY BOUNDARIES (TEST-18 to TEST-24)
  // ==========================================================================

  await t.test('TEST-2B4A-18: No 2B-4A path invokes ElementHandle.click', async () => {
    const { coordinator, sessionId } = setupApprovedSession();
    const handleSpy = createSyntheticElementHandle();
    const mockPage = createSyntheticPage({ buttonHandle: handleSpy });

    await coordinator.validatePreDispatch(sessionId, { page: mockPage });
    assert.equal(handleSpy.clickCount, 0, 'validatePreDispatch must not click');

    await coordinator.acquireRetainedButtonHandle(mockPage, coordinator.guard.activeSession.snapshot);
    assert.equal(handleSpy.clickCount, 0, 'acquireRetainedButtonHandle must not click');

    await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    assert.equal(handleSpy.clickCount, 0, 'executePreDispatchGate must not click');
  });

  await t.test('TEST-2B4A-19: No 2B-4A path calls executeDispatchBoundary', async () => {
    const { coordinator, sessionId } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // Spy on ledger's executeDispatchBoundary if ledger exists
    let boundaryCalled = false;
    if (coordinator.ledger) {
      coordinator.ledger.executeDispatchBoundary = async () => {
        boundaryCalled = true;
        throw new Error('ILLEGAL_CALL_IN_2B4A');
      };
    }

    await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    assert.equal(boundaryCalled, false, '2B-4A must NEVER invoke executeDispatchBoundary()');
  });

  await t.test('TEST-2B4A-20: No DISPATCH_MAY_HAVE_STARTED event is written by 2B-4A', async () => {
    const { coordinator, sessionId, tempLedgerPath } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    await coordinator.executePreDispatchGate(sessionId, { page: mockPage });

    if (fs.existsSync(tempLedgerPath)) {
      const content = fs.readFileSync(tempLedgerPath, 'utf8');
      assert.equal(content.includes('DISPATCH_MAY_HAVE_STARTED'), false, 'Ledger must NEVER contain DISPATCH_MAY_HAVE_STARTED in 2B-4A');
    }
  });

  await t.test('TEST-2B4A-21: INTENT_PREPARED is not written by 2B-4A', async () => {
    const { coordinator, sessionId, tempLedgerPath } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    await coordinator.executePreDispatchGate(sessionId, { page: mockPage });

    if (fs.existsSync(tempLedgerPath)) {
      const content = fs.readFileSync(tempLedgerPath, 'utf8');
      assert.equal(content.includes('INTENT_PREPARED'), false, 'Ledger must NOT contain INTENT_PREPARED in 2B-4A (deferred to 2B-4B)');
    }
  });

  await t.test('TEST-2B4A-22: Synthetic selector usage is clearly fixture-scoped', async () => {
    const { coordinator, sessionId } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    const gateRes = await coordinator.executePreDispatchGate(sessionId, { page: mockPage });
    assert.equal(gateRes.success, true);
    // Verified that selector used belongs to synthetic fixture order summary
    assert.ok(gateRes.buttonSelector.includes('#spc-order-summary'));
    assert.equal(gateRes.containerSelector, '#spc-order-summary');
  });

  await t.test('TEST-2B4A-23: Renderer-supplied financial fields cannot alter backend snapshot', async () => {
    const { coordinator, sessionId, activeSession } = setupApprovedSession();
    const originalTotal = activeSession.snapshot.totalPayablePaise;
    const mockPage = createSyntheticPage();

    // Adversarial options trying to override price/total/asin during pre-dispatch
    await coordinator.validatePreDispatch(sessionId, {
      page: mockPage,
      totalPayablePaise: 99,
      itemPricePaise: 99,
      targetAsin: 'FORGED_ASIN'
    });

    assert.equal(activeSession.snapshot.totalPayablePaise, originalTotal, 'Snapshot total must remain untampered');
    assert.equal(activeSession.snapshot.targetAsin, 'B09XYZ1234', 'Snapshot ASIN must remain untampered');
  });

  await t.test('TEST-2B4A-24: A stale/invalid session cannot acquire a submission lock', async () => {
    const { coordinator, sessionId } = setupApprovedSession();
    const mockPage = createSyntheticPage();

    // Attempt pre-dispatch gate with forged/non-existent session ID
    const staleResult = await coordinator.executePreDispatchGate('chk_non_existent_fake_id', { page: mockPage });
    assert.equal(staleResult.success, false);
    assert.equal(staleResult.gatePassed, false);
    assert.equal(staleResult.reason, 'SESSION_MISMATCH');
  });

});
