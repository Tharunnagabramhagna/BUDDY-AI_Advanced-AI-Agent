/**
 * Buddy AI — Customer Approval Preload & Spotlight IPC Integration Suite (Increment 2B-3)
 * 
 * Test File: tests/integration/checkout_approval_ipc_2b3.test.cjs
 * 
 * Tests the complete customer approval pipeline from Preload IPC to Spotlight UI contracts:
 * 1. Zero-trust sanitization in preload.js (dropping all caller-supplied financial values, tokens, checksums).
 * 2. Backend-authoritative approval in main.cjs via CheckoutCoordinator.
 * 3. Strict failure closed on mismatched, expired, or duplicate approvals.
 * 4. Cancellation flow terminating at CHECKOUT_ABORTED without dispatch.
 * 5. Invariant enforcement: ZERO Place Order click, ZERO submission lock, ZERO DISPATCH_MAY_HAVE_STARTED, ZERO VERIFIED_PLACED.
 * 6. UI safety contracts: authoritative price display, single-flight locking, and safe failure state.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 1. Modules under test
require('../../backend/electron/preload/preload.js');
const {
  createBuddyAgentBridge,
  sanitizeApprovalRequest,
  sanitizeCancelRequest
} = globalThis.__buddyPreloadExports || require('../../backend/electron/preload/preload.js');

const {
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
} = require('../../backend/electron/main/main.cjs');

const { STATES } = require('../../backend/electron/checkout/CheckoutSafetyEngine.cjs');

// 2. Fixture loader helper
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
function loadFixture(filename) {
  return fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
}

const spcReviewHtml = loadFixture('amazon_spc_review.html');
const spcUrl = 'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1';

function createMockPage(html, url = spcUrl) {
  return {
    url: () => url,
    content: async () => html,
    isClosed: () => false,
    $: async () => null,
    evaluate: async (fn, ...args) => {
      if (typeof fn === 'function') {
        return fn(...args);
      }
      return null;
    }
  };
}

function resetActiveSession() {
  checkoutCoordinator.guard.activeSession = null;
}

test('Buddy AI — Customer Approval Preload & Spotlight IPC Integration Suite (Increment 2B-3)', async (t) => {

  // ==========================================================================
  // SECTION 1: PRELOAD IPC SURFACE & ZERO-TRUST SANITIZATION (TEST-01 to TEST-09)
  // ==========================================================================

  await t.test('TEST-2B3-01: Preload exposes approval and cancellation APIs', () => {
    let invokedChannel = null;
    const mockRenderer = {
      invoke: async (channel) => { invokedChannel = channel; return { success: true }; }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    assert.equal(typeof bridge.approvePurchase, 'function', 'approvePurchase must be a function on bridge');
    assert.equal(typeof bridge.cancelCheckout, 'function', 'cancelCheckout must be a function on bridge');
    assert.equal(typeof bridge.getSafeReview, 'function', 'getSafeReview must be a function on bridge');
  });

  await t.test('TEST-2B3-02: Preload accepts valid {sessionId, snapshotId} and forwards over IPC', async () => {
    let invokedChannel = null;
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedChannel = channel;
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({ sessionId: 'chk_valid_123', snapshotId: 'snap_valid_456' });

    assert.equal(invokedChannel, 'checkout-approve-purchase', 'Must invoke checkout-approve-purchase channel');
    assert.deepEqual(invokedPayload, { sessionId: 'chk_valid_123', snapshotId: 'snap_valid_456' });
  });

  await t.test('TEST-2B3-03: Preload strips/ignores extra fields from user payload', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      untrustedMetadata: 'should_be_stripped',
      timestamp: Date.now(),
      hackerFlag: true
    });

    assert.deepEqual(invokedPayload, {
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456'
    }, 'Extra fields must be completely stripped by preload sanitizer');
  });

  await t.test('TEST-2B3-04: Renderer cannot provide approvalToken via preload', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      approvalToken: 'forged_approval_token_12345'
    });

    assert.equal(invokedPayload.approvalToken, undefined, 'approvalToken must be dropped in preload');
  });

  await t.test('TEST-2B3-05: Renderer cannot provide canonicalChecksum via preload', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      canonicalChecksum: 'forged_sha256_checksum'
    });

    assert.equal(invokedPayload.canonicalChecksum, undefined, 'canonicalChecksum must be dropped in preload');
  });

  await t.test('TEST-2B3-06: Renderer cannot override price via preload', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      price: 1.0,
      itemPrice: 100
    });

    assert.equal(invokedPayload.price, undefined, 'price must be dropped in preload');
    assert.equal(invokedPayload.itemPrice, undefined, 'itemPrice must be dropped in preload');
  });

  await t.test('TEST-2B3-07: Renderer cannot override totalPayablePaise via preload', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      totalPayablePaise: 100,
      totalPayable: 1
    });

    assert.equal(invokedPayload.totalPayablePaise, undefined, 'totalPayablePaise must be dropped in preload');
    assert.equal(invokedPayload.totalPayable, undefined, 'totalPayable must be dropped in preload');
  });

  await t.test('TEST-2B3-08: Renderer cannot override targetAsin via preload', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      targetAsin: 'B000FORGED'
    });

    assert.equal(invokedPayload.targetAsin, undefined, 'targetAsin must be dropped in preload');
  });

  await t.test('TEST-2B3-09: Renderer cannot override quantity via preload and malformed calls reject', async () => {
    let invokedPayload = null;
    const mockRenderer = {
      invoke: async (channel, payload) => {
        invokedPayload = payload;
        return { success: true };
      }
    };
    const bridge = createBuddyAgentBridge(mockRenderer);

    await bridge.approvePurchase({
      sessionId: 'chk_valid_123',
      snapshotId: 'snap_valid_456',
      quantity: 999
    });

    assert.equal(invokedPayload.quantity, undefined, 'quantity must be dropped in preload');

    // Also test malformed request shapes reject closed
    await assert.rejects(async () => bridge.approvePurchase(null), /INVALID_APPROVAL_REQUEST/);
    await assert.rejects(async () => bridge.approvePurchase({}), /INVALID_APPROVAL_REQUEST/);
    await assert.rejects(async () => bridge.approvePurchase({ sessionId: '123' }), /INVALID_APPROVAL_REQUEST/);
    await assert.rejects(async () => bridge.approvePurchase({ snapshotId: '456' }), /INVALID_APPROVAL_REQUEST/);
  });

  // ==========================================================================
  // SECTION 2: MAIN PROCESS IPC ROUTING & APPROVAL VALIDATION (TEST-10 to TEST-15)
  // ==========================================================================

  await t.test('TEST-2B3-10: Main IPC handler routes to backend handleCustomerApproval with zero-trust', async () => {
    resetActiveSession();
    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    assert.equal(typeof handler, 'function', 'checkout-approve-purchase handler must be registered in main.cjs');

    // Attempting approval without active session fails closed
    const result = await handler(null, {
      sessionId: 'chk_unmatched_session',
      snapshotId: 'snap_unmatched',
      price: 1,
      totalPayablePaise: 1
    });

    assert.equal(result.success, false, 'Must fail closed for unknown session');
    assert.equal(result.approved, false);
  });

  await t.test('TEST-2B3-11: Valid sessionId + snapshotId reaches PURCHASE_APPROVED on the backend', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(reviewResult.success, true);
    assert.equal(reviewResult.state, STATES.AWAITING_CUSTOMER_APPROVAL);
    const sessionId = reviewResult.sessionId;
    const snapshotId = reviewResult.safeReview.snapshotId;

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const approvalResult = await handler(null, { sessionId, snapshotId });

    assert.equal(approvalResult.success, true, 'Approval must succeed');
    assert.equal(approvalResult.approved, true);
    assert.equal(approvalResult.state, 'PURCHASE_APPROVED');
    assert.equal(approvalResult.sessionId, sessionId);
    assert.equal(approvalResult.snapshotId, snapshotId);

    // Verify backend guard state is authoritatively PURCHASE_APPROVED
    assert.equal(checkoutCoordinator.guard.activeSession.state, STATES.PURCHASE_APPROVED);
  });

  await t.test('TEST-2B3-12: Wrong sessionId fails closed', async () => {
    resetActiveSession();
    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const result = await handler(null, {
      sessionId: 'chk_completely_wrong_id',
      snapshotId: 'snap_random'
    });

    assert.equal(result.success, false);
    assert.equal(result.approved, false);
    assert.match(result.reason, /SESSION_MISMATCH|SESSION_NOT_FOUND|SESSION_ID_REQUIRED/);
  });

  await t.test('TEST-2B3-13: Wrong snapshotId fails closed', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(reviewResult.success, true);
    const sessionId = reviewResult.sessionId;

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const result = await handler(null, {
      sessionId,
      snapshotId: 'snap_forged_or_wrong'
    });

    assert.equal(result.success, false);
    assert.equal(result.approved, false);
    assert.equal(result.reason, 'SNAPSHOT_MISMATCH');
    assert.equal(checkoutCoordinator.guard.activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);
  });

  await t.test('TEST-2B3-14: Expired snapshot/session fails closed', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(reviewResult.success, true);
    const sessionId = reviewResult.sessionId;
    const snapshotId = reviewResult.safeReview.snapshotId;

    // Simulate expired snapshot (past 300s TTL)
    checkoutCoordinator.guard.activeSession.snapshot.expiresAt = Date.now() - 10000;

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const result = await handler(null, { sessionId, snapshotId });

    assert.equal(result.success, false);
    assert.equal(result.approved, false);
    assert.equal(result.reason, 'SNAPSHOT_EXPIRED');
    assert.notEqual(checkoutCoordinator.guard.activeSession.state, STATES.PURCHASE_APPROVED);
  });

  await t.test('TEST-2B3-15: Duplicate approval is rejected by backend safety', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const sessionId = reviewResult.sessionId;
    const snapshotId = reviewResult.safeReview.snapshotId;

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');

    // First approval succeeds
    const firstResult = await handler(null, { sessionId, snapshotId });
    assert.equal(firstResult.success, true);
    assert.equal(firstResult.state, 'PURCHASE_APPROVED');

    // Second approval on same approved session must be rejected
    const secondResult = await handler(null, { sessionId, snapshotId });
    assert.equal(secondResult.success, false, 'Duplicate approval must fail closed');
    assert.equal(secondResult.approved, false);
    assert.equal(secondResult.reason, 'INVALID_STATE_FOR_APPROVAL');
  });

  // ==========================================================================
  // SECTION 3: STRICT SAFETY & DISPATCH INVARIANTS (TEST-16 to TEST-20)
  // ==========================================================================

  await t.test('TEST-2B3-16: Approval does not acquire submission lock', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const sessionId = reviewResult.sessionId;
    const snapshotId = reviewResult.safeReview.snapshotId;

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    await handler(null, { sessionId, snapshotId });

    const active = checkoutCoordinator.guard.activeSession;
    assert.equal(active.state, STATES.PURCHASE_APPROVED);
    assert.equal(active.isSubmitting, false, 'Approval must NOT acquire submission lock');
    assert.equal(active.tokenConsumed, false, 'Token must not be consumed at approval');
  });

  await t.test('TEST-2B3-17: Approval does not emit DISPATCH_MAY_HAVE_STARTED', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    await handler(null, {
      sessionId: reviewResult.sessionId,
      snapshotId: reviewResult.safeReview.snapshotId
    });

    const ledgerPath = checkoutCoordinator.ledger?.filePath || path.join(os.tmpdir(), 'buddy_app_data', 'checkout_ledger.jsonl');
    if (fs.existsSync(ledgerPath)) {
      const content = fs.readFileSync(ledgerPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const ev = JSON.parse(line);
        assert.notEqual(ev.type, 'DISPATCH_MAY_HAVE_STARTED', 'Must never emit DISPATCH_MAY_HAVE_STARTED during approval');
      }
    }
  });

  await t.test('TEST-2B3-18: Approval does not click Place Order', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    let buttonClicked = false;
    mockPage.click = async (selector) => {
      if (selector.includes('placeYourOrder') || selector.includes('submitOrderButtonId')) {
        buttonClicked = true;
      }
    };

    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    await handler(null, {
      sessionId: reviewResult.sessionId,
      snapshotId: reviewResult.safeReview.snapshotId
    });

    assert.equal(buttonClicked, false, 'Place Order button must NEVER be clicked during approval');
  });

  await t.test('TEST-2B3-19: Approval does not produce VERIFIED_PLACED', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const result = await handler(null, {
      sessionId: reviewResult.sessionId,
      snapshotId: reviewResult.safeReview.snapshotId
    });

    assert.notEqual(result.outcome, 'VERIFIED_PLACED');
    assert.equal(result.orderPlaced, undefined);

    const terminal = checkoutCoordinator.getTerminalOutcome(reviewResult.sessionId);
    assert.equal(terminal, null, 'Session must remain in-flight (null terminal outcome) and not VERIFIED_PLACED');
  });

  await t.test('TEST-2B3-20: Approval result does not expose token/checksum/internal state', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const result = await handler(null, {
      sessionId: reviewResult.sessionId,
      snapshotId: reviewResult.safeReview.snapshotId
    });

    assert.equal(result.approvalToken, undefined, 'approvalToken MUST NOT be returned in IPC result');
    assert.equal(result.canonicalChecksum, undefined, 'canonicalChecksum MUST NOT be returned in IPC result');
    assert.equal(result.guard, undefined, 'guard instance must not be returned');
    assert.equal(result.ledger, undefined, 'ledger instance must not be returned');
    assert.equal(result.page, undefined, 'page handle must not be returned');
    assert.equal(result.elementHandle, undefined, 'elementHandle must not be returned');
  });

  // ==========================================================================
  // SECTION 4: SAFE CANCELLATION FLOW (TEST-21, TEST-22)
  // ==========================================================================

  await t.test('TEST-2B3-21: Cancel does not produce PURCHASE_APPROVED and transitions to CHECKOUT_ABORTED', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const cancelHandler = getRegisteredIpcHandler('checkout-cancel');
    assert.equal(typeof cancelHandler, 'function', 'checkout-cancel handler must be registered');

    const cancelResult = await cancelHandler(null, {
      sessionId: reviewResult.sessionId,
      reason: 'USER_CANCELLED'
    });

    assert.equal(cancelResult.success, true);
    assert.equal(cancelResult.cancelled, true);
    assert.equal(cancelResult.state, 'CHECKOUT_ABORTED');
    assert.notEqual(cancelResult.state, 'PURCHASE_APPROVED');

    // Token must be strictly null
    assert.equal(checkoutCoordinator.guard.activeSession.approvalToken, null);
    assert.equal(checkoutCoordinator.guard.activeSession.state, STATES.CHECKOUT_ABORTED);
  });

  await t.test('TEST-2B3-22: Cancel does not cross dispatch boundary', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const cancelHandler = getRegisteredIpcHandler('checkout-cancel');
    await cancelHandler(null, { sessionId: reviewResult.sessionId });

    const terminal = checkoutCoordinator.getTerminalOutcome(reviewResult.sessionId);
    assert.equal(terminal.outcome, 'CHECKOUT_ABORTED');
    assert.equal(terminal.success, false);
    assert.equal(terminal.orderPlaced, false);
    assert.equal(terminal.uncertain, false);
  });

  // ==========================================================================
  // SECTION 5: SPOTLIGHT UI SAFETY CONTRACTS (TEST-23 to TEST-25)
  // ==========================================================================

  await t.test('TEST-2B3-23: Spotlight displays backend-provided total rather than recalculating authority', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // Verify AgentPurchaseReviewCard is defined and reads totalPayablePaise directly
    assert.match(spotlightCode, /const AgentPurchaseReviewCard\s*=/, 'AgentPurchaseReviewCard must be defined');
    assert.match(spotlightCode, /safeReview\.totalPayablePaise/, 'Must reference safeReview.totalPayablePaise');

    // Verify it formats the backend total rather than doing addition of prices in JS
    assert.match(spotlightCode, /displayTotal\s*=\s*formatPaise\(safeReview\.totalPayablePaise\)/,
      'Authoritative display total must be read strictly from backend-provided totalPayablePaise');

    // Verify approval request payload contains NO financial values
    assert.match(spotlightCode, /approvalPayload\s*=\s*\{\s*sessionId,\s*snapshotId:\s*safeReview\?\.snapshotId\s*\}/,
      'Approval payload sent from Spotlight must contain strictly sessionId and snapshotId');
  });

  await t.test('TEST-2B3-24: Approval button cannot issue duplicate concurrent approval calls from the same UI interaction', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // Verify single-flight guard: isSubmittingRef and APPROVAL_PENDING state
    assert.match(spotlightCode, /isSubmittingRef\.current/, 'Must use isSubmittingRef for concurrency guard');
    assert.match(spotlightCode, /setUiState\(['"]APPROVAL_PENDING['"]\)/, 'Must transition to APPROVAL_PENDING immediately upon click');
    assert.match(spotlightCode, /disabled=\{isPending \|\| isApproved\}/, 'Approve button must be disabled while pending or approved');
  });

  await t.test('TEST-2B3-25: Approval failure leaves UI in safe non-approved state without Place Order progression', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // Verify failure handling: transitions to APPROVAL_FAILED and never calls amazon_place_order
    assert.match(spotlightCode, /setUiState\(['"]APPROVAL_FAILED['"]\)/, 'Must transition to APPROVAL_FAILED on rejection');
    assert.match(spotlightCode, /setErrorMessage\(result\?\.reason \|\| result\?\.error/, 'Must store rejection reason for user review');

    // Verify the approval card does NOT call amazon_place_order
    const approvalCardMatch = spotlightCode.match(/const AgentPurchaseReviewCard = React\.memo\([\s\S]*?\n\}\);/);
    assert.ok(approvalCardMatch, 'AgentPurchaseReviewCard block found');
    assert.equal(
      approvalCardMatch[0].includes('amazon_place_order'),
      false,
      'AgentPurchaseReviewCard must NEVER call amazon_place_order'
    );
  });

  // ==========================================================================
  // SECTION 6: TARGETED AUDIT REMEDIATION SUITE (TEST-2B3-R01 to TEST-2B3-R07)
  // ==========================================================================

  await t.test('TEST-2B3-R01: Agent action amazon_approve_purchase cannot produce PURCHASE_APPROVED', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    assert.equal(reviewResult.success, true);
    assert.equal(reviewResult.state, STATES.AWAITING_CUSTOMER_APPROVAL);
    const sessionId = reviewResult.sessionId;
    const snapshotId = reviewResult.safeReview.snapshotId;

    // Call executeAgentAction directly with amazon_approve_purchase
    const agentResult = await executeAgentAction({
      type: 'amazon_approve_purchase',
      page: mockPage,
      sessionId,
      snapshotId
    });

    // Must be rejected closed
    assert.equal(agentResult.success, false, 'Agent action amazon_approve_purchase must be rejected');
    assert.match(agentResult.error, /AGENT_APPROVAL_DISALLOWED|Unknown action type/);

    // Crucial invariant: backend session must NOT have transitioned to PURCHASE_APPROVED
    assert.equal(
      checkoutCoordinator.guard.activeSession.state,
      STATES.AWAITING_CUSTOMER_APPROVAL,
      'Session must remain AWAITING_CUSTOMER_APPROVAL and NOT PURCHASE_APPROVED'
    );
  });

  await t.test('TEST-2B3-R02: executeAgentAction does not expose an approval action that bypasses explicit user approval', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const agentResult = await executeAgentAction({
      type: 'amazon_approve_purchase',
      page: mockPage,
      sessionId: 'chk_test_bypass',
      snapshotId: 'snap_test_bypass'
    });

    assert.equal(agentResult.success, false);
    assert.equal(checkoutCoordinator.guard.activeSession, null);
  });

  await t.test('TEST-2B3-R03: A failed/invalid review stage does not produce role: final-confirm', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // Verify there is NO ternary branch or fallback in payment handling that yields 'final-confirm' when reviewStage is missing or not AWAITING_CUSTOMER_APPROVAL
    const hasFinalConfirmFallback = /result\?\.reviewStage\?\.state === ['"]AWAITING_CUSTOMER_APPROVAL['"][\s\S]*?\:[\s\S]*?role:\s*['"]final-confirm['"]/.test(spotlightCode);
    assert.equal(hasFinalConfirmFallback, false, 'Spotlight must not fall back to final-confirm when review stage is not approved');

    const hasVerifyFinalConfirmFallback = /verifyResult\?\.reviewStage\?\.state === ['"]AWAITING_CUSTOMER_APPROVAL['"][\s\S]*?\:[\s\S]*?role:\s*['"]final-confirm['"]/.test(spotlightCode);
    assert.equal(hasVerifyFinalConfirmFallback, false, 'Spotlight verifyResult must not fall back to final-confirm when review stage is not approved');
  });

  await t.test('TEST-2B3-R04: A failed/invalid review stage cannot invoke amazon_place_order', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // Verify that failed review branches in payment select and card verify set warning text and stop
    assert.match(spotlightCode, /Review verification failed or stage missing/, 'Must have fail-closed review failure handler');
    assert.match(spotlightCode, /Checkout stopped for safety/, 'Must stop checkout on review failure');
  });

  await t.test('TEST-2B3-R05: A valid AWAITING_CUSTOMER_APPROVAL review still produces purchase-review-approval', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // When hasValidReview is true, it mounts purchase-review-approval
    assert.match(spotlightCode, /role:\s*['"]purchase-review-approval['"]/, 'Must render purchase-review-approval for valid review');
  });

  await t.test('TEST-2B3-R06: Explicit Spotlight approval still reaches the existing checkout-approve-purchase IPC path', () => {
    const spotlightCode = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'chat', 'Spotlight.jsx'),
      'utf8'
    );

    // Verify handleApprove invokes window.buddyAgent.approvePurchase
    assert.match(spotlightCode, /window\.buddyAgent(?:\?)?\.approvePurchase\(approvalPayload\)/,
      'Spotlight must strictly call window.buddyAgent.approvePurchase');

    // And verify AgentPurchaseReviewCard does NOT contain checkoutStep fallback for approval
    const cardMatch = spotlightCode.match(/const AgentPurchaseReviewCard = React\.memo\([\s\S]*?\n\}\);/);
    assert.ok(cardMatch, 'AgentPurchaseReviewCard block found');
    assert.equal(
      cardMatch[0].includes('amazon_approve_purchase'),
      false,
      'AgentPurchaseReviewCard must not contain amazon_approve_purchase fallback'
    );
  });

  await t.test('TEST-2B3-R07: Successful approval still ends at PURCHASE_APPROVED and does not dispatch', async () => {
    resetActiveSession();
    const mockPage = createMockPage(spcReviewHtml);
    const reviewResult = await handleReviewStage(mockPage, {
      targetAsin: 'B09XYZ1234',
      approvedBudget: 25000
    });

    const handler = getRegisteredIpcHandler('checkout-approve-purchase');
    const approvalResult = await handler(null, {
      sessionId: reviewResult.sessionId,
      snapshotId: reviewResult.safeReview.snapshotId
    });

    assert.equal(approvalResult.success, true);
    assert.equal(approvalResult.state, 'PURCHASE_APPROVED');
    assert.equal(checkoutCoordinator.guard.activeSession.state, STATES.PURCHASE_APPROVED);
    assert.equal(checkoutCoordinator.guard.activeSession.isSubmitting, false);
    assert.equal(checkoutCoordinator.getTerminalOutcome(reviewResult.sessionId), null);
  });
});
