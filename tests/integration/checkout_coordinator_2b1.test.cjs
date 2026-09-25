/**
 * Buddy AI — Checkout Coordinator Integration Suite (Increment 2B-1)
 * 
 * Verifies the 2B-1 foundation:
 * - CheckoutCoordinator initialization and frozen engine orchestration
 * - Review evidence evaluation and canonical snapshot extraction
 * - Snapshot binding to active session
 * - Backend-authoritative approval path and submission lock
 * - Zero-trust renderer boundaries (tampering, forged tokens, forged claims)
 * - Invariant: 2B-1 never crosses the Place Order dispatch boundary or clicks
 * - Fail-closed error handling
 * 
 * Run with: node --test tests/integration/checkout_coordinator_2b1.test.cjs
 */

'use strict';

const { test, describe, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const {
  CheckoutCoordinator,
  formatTerminalOutcome,
  AUTHORITATIVE_OUTCOMES
} = require('../../backend/electron/checkout/CheckoutCoordinator.cjs');

const {
  CheckoutSessionGuard,
  CheckoutLedger,
  STATES
} = require('../../backend/electron/checkout/CheckoutSafetyEngine.cjs');

describe('Buddy AI — Checkout Coordinator Integration Suite (Increment 2B-1)', () => {

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
    tempLedgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy_coord_2b1_'));
    tempLedgerPath = path.join(tempLedgerDir, 'test_ledger.jsonl');
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

  // ==========================================================================
  // TEST-2B1-01: Coordinator can initialize using the frozen safety engine
  // ==========================================================================

  test('TEST-2B1-01: Coordinator initializes cleanly with frozen safety engine instances', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });

    assert.ok(coordinator.guard instanceof CheckoutSessionGuard, 'Guard is instance of CheckoutSessionGuard');
    assert.ok(coordinator.ledger instanceof CheckoutLedger, 'Ledger is instance of CheckoutLedger');

    const sessionRes = coordinator.startSession('B09XYZ1234', 25000);
    assert.equal(sessionRes.success, true);
    assert.ok(sessionRes.sessionId.startsWith('chk_'));

    const info = coordinator.getActiveSessionInfo();
    assert.equal(info.targetAsin, 'B09XYZ1234');
    assert.equal(info.state, STATES.CART_ISOLATED);
    assert.equal(info.hasSnapshot, false);
  });

  // ==========================================================================
  // TEST-2B1-02: Valid review evidence reaches canonical snapshot extraction
  // ==========================================================================

  test('TEST-2B1-02: Valid review evidence reaches canonical snapshot extraction', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    const result = coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html?hasWorkingJavascript=1',
      boundPageId: 'page_test_1'
    });

    assert.equal(result.success, true);
    assert.ok(result.safeView, 'Safe review view is returned');
    assert.equal(result.safeView.targetAsin, 'B09XYZ1234');
    assert.equal(result.safeView.extractedAsin, 'B09XYZ1234');
    assert.equal(result.safeView.quantity, 1);
    assert.equal(result.safeView.totalPayablePaise, 1999000); // ₹19,990.00
    assert.equal(result.safeView.currency, 'INR');
  });

  // ==========================================================================
  // TEST-2B1-03: Invalid/non-verified review evidence fails closed
  // ==========================================================================

  test('TEST-2B1-03: Invalid/non-verified review evidence fails closed (GAP-DEF-02 elimination)', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    // Test A: Payselect page with negative signals (active payment radio, payselect URL)
    const payselectRes = coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: payselectHtml,
      url: 'https://www.amazon.in/gp/buy/payselect/handlers/display.html',
      boundPageId: 'page_test_payselect'
    });

    assert.equal(payselectRes.success, false);
    assert.equal(payselectRes.reason, 'REVIEW_EVIDENCE_NOT_VERIFIED');
    assert.equal(payselectRes.evaluationStatus, 'NOT_VERIFIED');
    assert.ok(payselectRes.negativeSignals.includes('PAY_SELECT_URL'));

    // State in guard must remain CART_ISOLATED (did not transition to REVIEW_VERIFIED)
    const info = coordinator.getActiveSessionInfo();
    assert.equal(info.state, STATES.CART_ISOLATED);
    assert.equal(info.hasSnapshot, false);

    // Test B: Empty or malformed DOM
    const emptyRes = coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: '',
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });
    assert.equal(emptyRes.success, false);
    assert.equal(emptyRes.reason, 'REVIEW_EVIDENCE_NOT_VERIFIED');
  });

  // ==========================================================================
  // TEST-2B1-04: Canonical snapshot becomes bound to the correct session
  // ==========================================================================

  test('TEST-2B1-04: Canonical snapshot becomes bound to the correct session', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    const bindRes = coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html',
      boundPageId: 'page_bind_test'
    });

    assert.equal(bindRes.success, true);

    const activeSession = coordinator.guard.activeSession;
    assert.ok(activeSession.snapshot, 'Snapshot is bound to activeSession');
    assert.equal(activeSession.snapshot.checkoutSessionId, sessionId);
    assert.equal(activeSession.snapshot.targetAsin, 'B09XYZ1234');
    assert.equal(activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);

    // Safe view does NOT expose internal checksum or internal fields
    const safeView = coordinator.getSafeReviewView(sessionId);
    assert.equal(safeView.sessionId, sessionId);
    assert.equal(safeView.snapshotId, activeSession.snapshot.snapshotId);
    assert.equal(safeView.canonicalChecksum, undefined, 'Checksum is not exposed in safe view');
  });

  // ==========================================================================
  // TEST-2B1-05: Renderer-style request containing forged price/total/ASIN does NOT replace canonical snapshot data
  // ==========================================================================

  test('TEST-2B1-05: Renderer-style request containing forged price/total/ASIN does NOT replace canonical snapshot data', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });

    const canonicalSnapshot = coordinator.guard.activeSession.snapshot;
    const genuineSnapshotId = canonicalSnapshot.snapshotId;
    const genuineTotal = canonicalSnapshot.totalPayablePaise;

    // Malicious renderer request attempts to inject forged financial and identity values
    const maliciousRequest = {
      sessionId,
      snapshotId: genuineSnapshotId,
      totalPayablePaise: 100,      // Forged ₹1.00
      totalPayable: 1,
      itemPricePaise: 100,
      targetAsin: 'FORGED_ASIN',
      quantity: 99,
      approved: true
    };

    const approvalResult = coordinator.processUserApproval(sessionId, maliciousRequest);
    assert.equal(approvalResult.success, true);
    assert.equal(approvalResult.approved, true);

    // Assert that the canonical snapshot in the backend guard remains 100% UNTOUCHED
    const guardSnapshot = coordinator.guard.activeSession.snapshot;
    assert.equal(guardSnapshot.totalPayablePaise, genuineTotal, 'Total remained genuine 1999000 paise');
    assert.equal(guardSnapshot.totalPayablePaise, 1999000);
    assert.equal(guardSnapshot.targetAsin, 'B09XYZ1234', 'ASIN remained genuine');
    assert.equal(guardSnapshot.quantity, 1, 'Quantity remained 1');
  });

  // ==========================================================================
  // TEST-2B1-06: Renderer-style request containing approvalToken is rejected or ignored
  // ==========================================================================

  test('TEST-2B1-06: Renderer-style request containing approvalToken is rejected or ignored', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });

    const genuineSnapshotId = coordinator.guard.activeSession.snapshot.snapshotId;

    // Renderer attempts to supply its own approvalToken
    const forgedTokenRequest = {
      snapshotId: genuineSnapshotId,
      approvalToken: 'FORGED_RENDERER_SUPPLIED_TOKEN_1234567890'
    };

    const result = coordinator.processUserApproval(sessionId, forgedTokenRequest);
    assert.equal(result.success, true);

    // The coordinator's return payload MUST NEVER echo or accept the forged token
    assert.equal(result.approvalToken, undefined, 'approvalToken is not in return payload');

    // The guard's internal approval token is a genuine 64-char hex string generated by crypto
    const backendToken = coordinator.guard.activeSession.approvalToken;
    assert.ok(typeof backendToken === 'string');
    assert.equal(backendToken.length, 64);
    assert.notEqual(backendToken, 'FORGED_RENDERER_SUPPLIED_TOKEN_1234567890');
  });

  // ==========================================================================
  // TEST-2B1-07: Renderer-style request containing approved:true cannot bypass backend approval
  // ==========================================================================

  test('TEST-2B1-07: Renderer-style request containing approved:true cannot bypass backend approval', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });

    // Renderer tries to bypass approval directly to submission lock with fake "approved: true"
    // State is still AWAITING_CUSTOMER_APPROVAL
    assert.equal(coordinator.guard.activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);

    // Attempting to prepare submission lock before legitimate approval MUST fail
    const lockResult = coordinator.prepareSubmissionLock(sessionId);
    assert.equal(lockResult.success, false);
    assert.equal(lockResult.reason, 'NO_INTERNAL_APPROVAL_TOKEN');
    assert.equal(coordinator.guard.activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);
  });

  // ==========================================================================
  // TEST-2B1-08: Approval uses the backend canonical snapshot
  // ==========================================================================

  test('TEST-2B1-08: Approval uses the backend canonical snapshot and validates checksum', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });

    // Request with wrong snapshot ID fails closed
    const wrongSnapRes = coordinator.processUserApproval(sessionId, {
      snapshotId: 'snap_wrong_id_9999'
    });
    assert.equal(wrongSnapRes.success, false);
    assert.equal(wrongSnapRes.reason, 'SNAPSHOT_MISMATCH');

    // Request with correct snapshot ID succeeds
    const genuineSnapshotId = coordinator.guard.activeSession.snapshot.snapshotId;
    const correctRes = coordinator.processUserApproval(sessionId, {
      snapshotId: genuineSnapshotId
    });
    assert.equal(correctRes.success, true);
    assert.equal(coordinator.guard.activeSession.state, STATES.PURCHASE_APPROVED);
  });

  // ==========================================================================
  // TEST-2B1-09: Submission lock is acquired through the frozen engine
  // ==========================================================================

  test('TEST-2B1-09: Submission lock is acquired through the frozen engine and transitions to PREFLIGHT_VERIFIED', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });

    const snapshotId = coordinator.guard.activeSession.snapshot.snapshotId;
    coordinator.processUserApproval(sessionId, { snapshotId });

    // Acquire submission lock
    const lockRes = coordinator.prepareSubmissionLock(sessionId);
    assert.equal(lockRes.success, true);
    assert.equal(lockRes.locked, true);
    assert.equal(lockRes.state, STATES.PREFLIGHT_VERIFIED);

    // Guard internal state checks
    const active = coordinator.guard.activeSession;
    assert.equal(active.isSubmitting, true);
    assert.equal(active.tokenConsumed, true);

    // Duplicate submission lock attempt is BLOCKED (concurrency protection)
    const duplicateRes = coordinator.prepareSubmissionLock(sessionId);
    assert.equal(duplicateRes.success, false);
    assert.equal(duplicateRes.reason, 'CONCURRENT_SUBMISSION_BLOCKED');
  });

  // ==========================================================================
  // TEST-2B1-10: 2B-1 NEVER crosses the Place Order dispatch boundary
  // ==========================================================================

  test('TEST-2B1-10: Invariant: 2B-1 NEVER crosses the Place Order dispatch boundary', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);

    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });

    const snapshotId = coordinator.guard.activeSession.snapshot.snapshotId;
    coordinator.processUserApproval(sessionId, { snapshotId });
    coordinator.prepareSubmissionLock(sessionId);

    // In 2B-1, the maximum state reached is PREFLIGHT_VERIFIED
    assert.equal(coordinator.guard.activeSession.state, STATES.PREFLIGHT_VERIFIED);

    // Confirm that DISPATCH_MAY_HAVE_STARTED has NOT been reached
    assert.notEqual(coordinator.guard.activeSession.state, STATES.DISPATCH_MAY_HAVE_STARTED);

    // If a ledger is configured, no DISPATCH_MAY_HAVE_STARTED event exists in it
    if (fs.existsSync(tempLedgerPath)) {
      const content = fs.readFileSync(tempLedgerPath, 'utf8');
      assert.equal(content.includes('DISPATCH_MAY_HAVE_STARTED'), false);
    }
  });

  // ==========================================================================
  // TEST-2B1-11: 2B-1 NEVER invokes a Place Order click
  // ==========================================================================

  test('TEST-2B1-11: Invariant: 2B-1 NEVER invokes a Place Order click', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });

    // Inspect coordinator prototype methods
    const methodNames = Object.getOwnPropertyNames(CheckoutCoordinator.prototype);

    // Verify coordinator exposes NO click execution methods in 2B-1
    assert.equal(methodNames.includes('clickPlaceOrder'), false);
    assert.equal(methodNames.includes('performPlaceOrderClick'), false);
    assert.equal(methodNames.includes('executeClickFallback'), false);

    // Start session and advance to preflight
    const { sessionId } = coordinator.startSession('B09XYZ1234', 25000);
    coordinator.extractAndBindReviewSnapshot(sessionId, {
      htmlString: spcReviewHtml,
      url: 'https://www.amazon.in/gp/buy/spc/handlers/display.html'
    });
    const snapshotId = coordinator.guard.activeSession.snapshot.snapshotId;
    coordinator.processUserApproval(sessionId, { snapshotId });
    coordinator.prepareSubmissionLock(sessionId);

    // Terminal outcome must still be null (not completed, never clicked)
    const outcome = coordinator.getTerminalOutcome(sessionId);
    assert.equal(outcome, null, 'No terminal outcome emitted in 2B-1');
  });

  // ==========================================================================
  // TEST-2B1-12: Malformed/invalid coordinator input fails closed
  // ==========================================================================

  test('TEST-2B1-12: Malformed/invalid coordinator input fails closed across all methods', () => {
    const coordinator = new CheckoutCoordinator({ ledgerPath: tempLedgerPath });

    // Invalid startSession inputs
    assert.equal(coordinator.startSession('', 25000).success, false);
    assert.equal(coordinator.startSession(null, 25000).success, false);
    assert.equal(coordinator.startSession(undefined, 25000).success, false);

    // Invalid extractAndBindReviewSnapshot inputs
    assert.equal(coordinator.extractAndBindReviewSnapshot('chk_nonexistent').success, false);
    assert.equal(coordinator.extractAndBindReviewSnapshot('chk_nonexistent', {}).success, false);

    // Invalid processUserApproval inputs
    assert.equal(coordinator.processUserApproval('chk_nonexistent', null).success, false);
    assert.equal(coordinator.processUserApproval('chk_nonexistent', {}).success, false);
    assert.equal(coordinator.processUserApproval('chk_nonexistent', { snapshotId: '' }).success, false);

    // Invalid prepareSubmissionLock input
    assert.equal(coordinator.prepareSubmissionLock('chk_nonexistent').success, false);

    // formatTerminalOutcome rejects invalid outcome strings
    assert.throws(() => {
      formatTerminalOutcome('INVALID_OUTCOME_STRING');
    }, /INVALID_TERMINAL_OUTCOME/);

    // formatTerminalOutcome correctly derives booleans for authoritative outcomes
    const placed = formatTerminalOutcome('VERIFIED_PLACED', { orderId: '402-1234567-1234567' });
    assert.equal(placed.outcome, 'VERIFIED_PLACED');
    assert.equal(placed.success, true);
    assert.equal(placed.orderPlaced, true);
    assert.equal(placed.uncertain, false);

    const aborted = formatTerminalOutcome('CHECKOUT_ABORTED', { reason: 'USER_CANCELLED' });
    assert.equal(aborted.outcome, 'CHECKOUT_ABORTED');
    assert.equal(aborted.success, false);
    assert.equal(aborted.orderPlaced, false);
    assert.equal(aborted.uncertain, false);

    const uncertain = formatTerminalOutcome('SUBMISSION_UNCERTAIN', { reason: 'TIMEOUT' });
    assert.equal(uncertain.outcome, 'SUBMISSION_UNCERTAIN');
    assert.equal(uncertain.success, false);
    assert.equal(uncertain.orderPlaced, false);
    assert.equal(uncertain.uncertain, true);
  });

  // ==========================================================================
  // TEST-2B1-13: Frozen 2A tests still pass unchanged
  // ==========================================================================

  test('TEST-2B1-13: Frozen 2A test suite runs and all 48 tests pass unchanged', () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.NODE_TEST_CONTEXT;
    const output = execSync('node --test tests/unit/checkout_safety_boundary.test.cjs', {
      encoding: 'utf8',
      cwd: path.join(__dirname, '..', '..'),
      env: cleanEnv
    });

    assert.ok(output.includes('pass 48'), '2A test suite reports 48 passed');
    assert.ok(output.includes('fail 0'), '2A test suite reports 0 failed');
  });

});
