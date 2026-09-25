/**
 * Buddy AI — Checkout Safety Boundary & Invariant Test Suite
 * 
 * Increment 2A Comprehensive Verification Suite
 * Directly exercises the production module: backend/electron/checkout/CheckoutSafetyEngine.cjs
 * 
 * Run with: node --test tests/unit/checkout_safety_boundary.test.cjs
 */

'use strict';

const { test, describe, before, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// Direct import of the exact production engine implementation
const {
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
} = require('../../backend/electron/checkout/CheckoutSafetyEngine.cjs');

describe('Buddy AI — Checkout Safety Boundary & Invariant Suite (Increment 2A)', () => {

  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  let payselectHtml = '';
  let spcReviewHtml = '';
  let thankyouHtml = '';
  let tempLedgerDir = '';

  before(() => {
    payselectHtml = fs.readFileSync(path.join(fixturesDir, 'amazon_payselect.html'), 'utf8');
    spcReviewHtml = fs.readFileSync(path.join(fixturesDir, 'amazon_spc_review.html'), 'utf8');
    thankyouHtml = fs.readFileSync(path.join(fixturesDir, 'amazon_thankyou.html'), 'utf8');
  });

  beforeEach(() => {
    tempLedgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy_ledger_test_'));
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
  // SECTION 1: PRODUCTION RUNTIME UNIT TESTS (DIRECT ENGINE EXECUTION)
  // ==========================================================================

  describe('Production Runtime: Canonical Snapshot Integrity & SHA-256 Consistency', () => {

    test('CRIT-01A: Extracted snapshot contains schemaVersion 2 and valid SHA-256 checksum', () => {
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, true);
      const snapshot = result.snapshot;
      assert.equal(snapshot.schemaVersion, 2);
      assert.equal(snapshot.currency, 'INR');
      assert.ok(typeof snapshot.canonicalChecksum === 'string');
      assert.equal(snapshot.canonicalChecksum.length, 64);
      assert.equal(verifySnapshotChecksum(snapshot), true);
    });

    test('CRIT-01B: Tampering with price, ASIN, or quantity invalidates canonical checksum', () => {
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      const snapshot = result.snapshot;

      // Tamper with totalPayablePaise
      const tamperedPrice = { ...snapshot, totalPayablePaise: snapshot.totalPayablePaise + 100 };
      assert.equal(verifySnapshotChecksum(tamperedPrice), false);

      // Tamper with ASIN
      const tamperedAsin = { ...snapshot, extractedAsin: 'B08DIFFER9' };
      assert.equal(verifySnapshotChecksum(tamperedAsin), false);

      // Tamper with quantity
      const tamperedQty = { ...snapshot, quantity: 2 };
      assert.equal(verifySnapshotChecksum(tamperedQty), false);
    });

    test('CRIT-01C: SHA-256 calculation matches manual Unit-Separator serialization', () => {
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      const snapshot = result.snapshot;

      const manualCanonicalStr = CANONICAL_FIELDS.map(f => {
        const v = snapshot[f];
        if (v === undefined || v === null) return '';
        if (typeof v === 'string') return v.trim().normalize('NFKC');
        if (typeof v === 'number') return String(Math.trunc(v));
        return String(v).trim().normalize('NFKC');
      }).join('\x1f');

      const expectedHash = crypto.createHash('sha256').update(manualCanonicalStr, 'utf8').digest('hex');
      assert.equal(snapshot.canonicalChecksum, expectedHash);
    });

  });

  describe('Production Runtime: Strict Price Parsing & Adversarial Fixture Handling', () => {

    test('CRIT-02A: toIntegerPaise handles standard currency and rejects malformed decimals without truncation', () => {
      assert.equal(toIntegerPaise(19990.00), 1999000);
      assert.equal(toIntegerPaise('₹19,990.00'), 1999000);
      assert.equal(toIntegerPaise('₹0.00'), 0);
      assert.equal(toIntegerPaise('49.50'), 4950);
      assert.equal(toIntegerPaise('49.5'), 4950);
      assert.equal(toIntegerPaise('-100.00'), -10000);
      assert.equal(toIntegerPaise('(₹500.00)'), -50000);

      // Adversarial cases: must return NaN, NEVER silently truncate!
      assert.ok(isNaN(toIntegerPaise('19.999')));
      assert.ok(isNaN(toIntegerPaise('19..50')));
      assert.ok(isNaN(toIntegerPaise('19.50.00')));
      assert.ok(isNaN(toIntegerPaise('₹19,990.005')));
      assert.ok(isNaN(toIntegerPaise('invalid_text')));
      assert.ok(isNaN(toIntegerPaise(19.999))); // Floating number with fractional paise
    });

    test('CRIT-02B: Missing #subtotals-marketplace-table fails closed (PRICE_SUMMARY_TABLE_MISSING)', () => {
      // Strips the subtotals table entirely
      const noTableHtml = spcReviewHtml.replace(/<div id="subtotals-marketplace-table"[\s\S]*?<\/div>\s*<\/div>/i, '');
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: noTableHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'PRICE_SUMMARY_TABLE_MISSING');
    });

    test('CRIT-02C: Missing explicit Items/MRP line item fails closed (ITEM_PRICE_COMPONENT_MISSING)', () => {
      // Table present, but Items row removed
      const noItemsRowHtml = spcReviewHtml.replace('<div class="a-row"><span>Items:</span><span>₹19,990.00</span></div>', '');
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: noItemsRowHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'ITEM_PRICE_COMPONENT_MISSING');
    });

    test('CRIT-02D: Duplicate component rows in table fail closed (DUPLICATE_PRICE_COMPONENT)', () => {
      // Injects a duplicate Items row
      const duplicateRowHtml = spcReviewHtml.replace(
        '<div class="a-row"><span>Items:</span><span>₹19,990.00</span></div>',
        '<div class="a-row"><span>Items:</span><span>₹19,990.00</span></div><div class="a-row"><span>Item Price:</span><span>₹19,990.00</span></div>'
      );
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: duplicateRowHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'DUPLICATE_PRICE_COMPONENT');
    });

    test('CRIT-02E: Missing component amount (empty span) fails closed (PRICE_COMPONENT_UNREADABLE)', () => {
      const emptySpanHtml = spcReviewHtml.replace(
        '<div class="a-row"><span>Delivery:</span><span>₹0.00</span></div>',
        '<div class="a-row"><span>Delivery:</span><span></span></div>'
      );
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: emptySpanHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'PRICE_COMPONENT_UNREADABLE');
    });

    test('CRIT-02F: Unknown fee row fails closed (UNKNOWN_PRICE_COMPONENT)', () => {
      const unknownFeeHtml = spcReviewHtml.replace(
        '<div class="a-row"><span>Delivery:</span><span>₹0.00</span></div>',
        '<div class="a-row"><span>Delivery:</span><span>₹0.00</span></div><div class="a-row"><span>Regulatory Processing Charge:</span><span>₹45.00</span></div>'
      );
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: unknownFeeHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'UNKNOWN_PRICE_COMPONENT');
      assert.ok(result.unrecognizedLabel.includes('regulatory processing charge'));
    });

    test('CRIT-02G: Nested markup inside table rows is parsed cleanly', () => {
      const nestedMarkupHtml = spcReviewHtml.replace(
        '<div class="a-row"><span>Items:</span><span>₹19,990.00</span></div>',
        '<div class="a-row"><span><span><strong class="label">Items:</strong></span></span><span><span class="a-price">₹19,990.00</span></span></div>'
      );
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: nestedMarkupHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, true);
      assert.equal(result.snapshot.itemPricePaise, 1999000);
      assert.equal(result.snapshot.totalPayablePaise, 1999000);
    });

    test('CRIT-02H: Negative discount row is parsed and subtracted in reconciliation', () => {
      const discountHtml = spcReviewHtml
        .replace('<div class="a-row"><span>Delivery:</span><span>₹0.00</span></div>',
                 '<div class="a-row"><span>Delivery:</span><span>₹0.00</span></div><div class="a-row"><span>Promotion Applied:</span><span>-₹990.00</span></div>')
        .replace('class="grand-total-price">₹19,990.00<', 'class="grand-total-price">₹19,000.00<');

      const result = PurchaseSnapshotExtractor.extract({
        htmlString: discountHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, true);
      assert.equal(result.snapshot.itemPricePaise, 1999000);
      assert.equal(result.snapshot.discountPaise, 99000);
      assert.equal(result.snapshot.totalPayablePaise, 1900000);
      // Formula: 1999000 + 0 - 99000 === 1900000
    });

    test('CRIT-02I: Component sum mismatch by 1 paisa fails closed (PRICE_RECONCILIATION_FAILED)', () => {
      const mismatchedHtml = spcReviewHtml.replace(
        '<div class="a-row"><span>Delivery:</span><span>₹0.00</span></div>',
        '<div class="a-row"><span>Delivery:</span><span>₹0.01</span></div>'
      );
      const result = PurchaseSnapshotExtractor.extract({
        htmlString: mismatchedHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });

      assert.equal(result.success, false);
      assert.equal(result.reason, 'PRICE_RECONCILIATION_FAILED');
      assert.equal(result.diff, -1);
    });

    test('CRIT-02J: Quantity and ASIN drift fail closed', () => {
      // Quantity mismatch (Qty = 2)
      const qtyTwoHtml = spcReviewHtml.replace('data-testid="item-quantity">1<', 'data-testid="item-quantity">2<');
      const qtyRes = PurchaseSnapshotExtractor.extract({
        htmlString: qtyTwoHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1
      });
      assert.equal(qtyRes.success, false);
      assert.equal(qtyRes.reason, 'QUANTITY_MISMATCH');

      // ASIN mismatch
      const asinRes = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B07DIFFASIN',
        expectedQuantity: 1
      });
      assert.equal(asinRes.success, false);
      assert.equal(asinRes.reason, 'ASIN_MISMATCH');

      // Budget exceeded
      const budgetRes = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 1500000 // 15,000 INR budget vs 19,990 total
      });
      assert.equal(budgetRes.success, false);
      assert.equal(budgetRes.reason, 'BUDGET_EXCEEDED');
    });

  });

  describe('Production Runtime: Strict State-Machine Transitions & Trust Boundary', () => {

    test('CRIT-03A: Legal state transition sequence executes successfully', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      assert.equal(guard.activeSession.state, STATES.CART_ISOLATED);

      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      assert.equal(guard.activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);

      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      assert.equal(guard.activeSession.state, STATES.PURCHASE_APPROVED);

      guard.acquireSubmissionLock(sessionId, approvalToken);
      assert.equal(guard.activeSession.state, STATES.PREFLIGHT_VERIFIED);

      guard.recordIntentPrepared(sessionId);
      assert.equal(guard.activeSession.state, STATES.INTENT_PREPARED);

      guard.recordDispatchMayHaveStarted(sessionId);
      assert.equal(guard.activeSession.state, STATES.DISPATCH_MAY_HAVE_STARTED);

      guard.recordDispatchCallReturned(sessionId);
      assert.equal(guard.activeSession.state, STATES.DISPATCH_CALL_RETURNED);

      guard.recordTerminalOutcome(sessionId, 'CONFIRMED');
      assert.equal(guard.archivedSessions.get(sessionId).state, STATES.ORDER_CONFIRMED);
      assert.equal(guard.activeSession, null);
    });

    test('CRIT-03B: Illegal state skip transition throws INVALID_STATE_TRANSITION', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);

      assert.throws(() => {
        guard.transitionState(sessionId, STATES.INTENT_PREPARED);
      }, /INVALID_STATE_TRANSITION/);
    });

    test('CRIT-03C: Transitioning from DISPATCH_MAY_HAVE_STARTED to CHECKOUT_ABORTED without proven pre-click abort throws', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);
      guard.recordIntentPrepared(sessionId);
      guard.recordDispatchMayHaveStarted(sessionId);

      assert.throws(() => {
        guard.transitionState(sessionId, STATES.CHECKOUT_ABORTED, { provenPreClickAbort: false });
      }, /ILLEGAL_TRANSITION_PAST_POINT_OF_NO_RETURN/);
    });

    test('CRIT-05E: Trust Boundary: Renderer cannot supply or override internal snapshot or state', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);

      // Attempting approval with a tampered snapshot payload from renderer fails
      const forgedSnapshotId = 'snap_forged_by_untrusted_renderer';
      const badAppr = guard.approvePurchase(sessionId, forgedSnapshotId);
      assert.equal(badAppr.success, false);
      assert.equal(badAppr.reason, 'SNAPSHOT_MISMATCH');
    });

  });

  describe('Production Runtime: Approval Token Security, Expiry, Revocation & Lockout', () => {

    test('CRIT-04A: Approval token strictly null before explicit approval', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);

      assert.equal(guard.activeSession.state, STATES.AWAITING_CUSTOMER_APPROVAL);
      assert.equal(guard.activeSession.approvalToken, null);
    });

    test('CRIT-04B: Token issuance requires exact snapshot ID and valid checksum', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);

      const badAppr = guard.approvePurchase(sessionId, 'snap_wrong_id');
      assert.equal(badAppr.success, false);
      assert.equal(badAppr.reason, 'SNAPSHOT_MISMATCH');
      assert.equal(guard.activeSession.approvalToken, null);

      guard.activeSession.snapshot.totalPayablePaise = 999;
      const corruptAppr = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      assert.equal(corruptAppr.success, false);
      assert.equal(corruptAppr.reason, 'SNAPSHOT_CHECKSUM_CORRUPTED');
    });

    test('CRIT-05A: Expired token (>60s TTL) rejected upon lock acquisition', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);

      guard.activeSession.approvalTokenExpiresAt = Date.now() - 1000;

      const lock = guard.acquireSubmissionLock(sessionId, approvalToken);
      assert.equal(lock.allowed, false);
      assert.equal(lock.reason, 'APPROVAL_TOKEN_EXPIRED');
    });

    test('CRIT-05B: Token cancellation immediately revokes and zeroes token', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);

      const cancelRes = guard.cancelApproval(sessionId, 'USER_CLICKED_CANCEL');
      assert.equal(cancelRes.success, true);
      assert.equal(guard.activeSession.approvalToken, null);
      assert.equal(guard.activeSession.state, STATES.CHECKOUT_ABORTED);

      const lock = guard.acquireSubmissionLock(sessionId, approvalToken);
      assert.equal(lock.allowed, false);
      assert.equal(lock.reason, 'STATE_NOT_APPROVED');
    });

    test('CRIT-05C: Replay of consumed token is rejected with CONCURRENT_SUBMISSION_BLOCKED / TOKEN_ALREADY_CONSUMED', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);

      const lock1 = guard.acquireSubmissionLock(sessionId, approvalToken);
      assert.equal(lock1.allowed, true);

      const lock2 = guard.acquireSubmissionLock(sessionId, approvalToken);
      assert.equal(lock2.allowed, false);
      assert.equal(lock2.reason, 'CONCURRENT_SUBMISSION_BLOCKED');
    });

    test('CRIT-05D: Wrong session ID or wrong token string rejected', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);

      const lockWrongSess = guard.acquireSubmissionLock('chk_other_session', approvalToken);
      assert.equal(lockWrongSess.allowed, false);
      assert.equal(lockWrongSess.reason, 'SESSION_MISMATCH');

      const lockWrongToken = guard.acquireSubmissionLock(sessionId, 'invalid_token_hex');
      assert.equal(lockWrongToken.allowed, false);
      assert.equal(lockWrongToken.reason, 'INVALID_APPROVAL_TOKEN');
    });

  });

  describe('Production Runtime: Failure Injection Across All Persistence Boundaries', () => {

    test('BOUNDARY-FAIL-01: INTENT_PREPARED write failure prevents dispatch and aborts cleanly', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);

      // Force failure on INTENT_PREPARED append
      ledger.fsyncHook = async (event) => {
        if (event.type === 'INTENT_PREPARED') {
          throw new Error('EACCES: permission denied writing INTENT_PREPARED');
        }
      };

      let clickInvoked = false;
      const performClick = async () => { clickInvoked = true; };

      await assert.rejects(async () => {
        await ledger.executeDispatchBoundary({ sessionId, guard, performClick });
      }, /INTENT_PERSISTENCE_FAILED/);

      assert.equal(clickInvoked, false, 'Click must never be invoked');
      assert.equal(guard.archivedSessions.get(sessionId).state, STATES.CHECKOUT_ABORTED);
      assert.equal(ledger.circuitBreakerTripped, true);
    });

    test('BOUNDARY-FAIL-02: DISPATCH_MAY_HAVE_STARTED write fails, emergency pre-click abort SUCCEEDS', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);

      ledger.fsyncHook = async (event) => {
        if (event.type === 'DISPATCH_MAY_HAVE_STARTED') {
          throw new Error('EIO: simulated disk write failure on boundary');
        }
      };

      let clickInvoked = false;
      const performClick = async () => { clickInvoked = true; };

      await assert.rejects(async () => {
        await ledger.executeDispatchBoundary({ sessionId, guard, performClick });
      }, /BOUNDARY_WRITE_FAILED/);

      assert.equal(clickInvoked, false, 'Click must never be invoked');

      // Verify emergency pre-click abort was persisted
      const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
      const abortEvent = lines.find(l => l.type === 'DISPATCH_ABORTED_PRE_CLICK');
      assert.ok(abortEvent);
      assert.equal(abortEvent.clickInvoked, false);
      assert.equal(guard.archivedSessions.get(sessionId).state, STATES.CHECKOUT_ABORTED);
    });

    test('BOUNDARY-FAIL-03: DISPATCH_MAY_HAVE_STARTED write fails AND emergency abort write ALSO fails', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);

      // Boundary write fails
      ledger.fsyncHook = async (event) => {
        if (event.type === 'DISPATCH_MAY_HAVE_STARTED') {
          throw new Error('EIO: primary boundary write failed');
        }
      };
      // Emergency write ALSO fails
      ledger.emergencyHook = async () => {
        throw new Error('ENOSPC: disk completely full during emergency abort write');
      };

      let clickInvoked = false;
      const performClick = async () => { clickInvoked = true; };

      await assert.rejects(async () => {
        await ledger.executeDispatchBoundary({ sessionId, guard, performClick });
      }, /BOUNDARY_WRITE_FAILED/);

      assert.equal(clickInvoked, false, 'Click must never be invoked');

      // Invariant: Status on disk is ambiguous! Must classify as SUBMISSION_UNCERTAIN and lock ASIN!
      assert.ok(guard.uncertainSessions.has(sessionId));
      assert.equal(guard.uncertainSessions.get(sessionId).state, STATES.SUBMISSION_UNCERTAIN);
      assert.ok(guard.lockedAsins.has('B09XYZ1234'));
      assert.equal(ledger.isLocked, true);
    });

    test('BOUNDARY-FAIL-04: Button click throws past point of no return (NO selector fallback, classified UNCERTAIN)', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);

      let fallbackSelectorCalled = false;
      const mockPage = { click: async () => { fallbackSelectorCalled = true; } };

      const performClick = async () => {
        throw new Error('Protocol error (DOM.dispatchMouseEvent): Node is detached from document');
      };

      await assert.rejects(async () => {
        await ledger.executeDispatchBoundary({ sessionId, guard, performClick });
      }, /Node is detached from document/);

      assert.equal(fallbackSelectorCalled, false, 'Forbidden selector fallback must not occur');
      assert.ok(guard.uncertainSessions.has(sessionId));
      assert.equal(guard.uncertainSessions.get(sessionId).state, STATES.SUBMISSION_UNCERTAIN);
      assert.ok(guard.lockedAsins.has('B09XYZ1234'));
    });

    test('BOUNDARY-FAIL-05: DISPATCH_CALL_RETURNED persistence failure locks ledger and marks UNCERTAIN', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);

      let clickInvoked = false;
      const performClick = async () => { clickInvoked = true; };

      // Force failure on DISPATCH_CALL_RETURNED
      ledger.fsyncHook = async (event) => {
        if (event.type === 'DISPATCH_CALL_RETURNED') {
          throw new Error('EIO: failed writing DISPATCH_CALL_RETURNED');
        }
      };

      await assert.rejects(async () => {
        await ledger.executeDispatchBoundary({ sessionId, guard, performClick });
      }, /DISPATCH_RETURN_PERSISTENCE_FAILED/);

      assert.equal(clickInvoked, true, 'Click was invoked before return persistence');
      assert.ok(guard.uncertainSessions.has(sessionId));
      assert.equal(guard.uncertainSessions.get(sessionId).state, STATES.SUBMISSION_UNCERTAIN);
      assert.ok(guard.lockedAsins.has('B09XYZ1234'));
      assert.equal(ledger.isLocked, true);
    });

    test('BOUNDARY-FAIL-06: SUBMISSION_UNCERTAIN event persistence failure locks ledger', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);
      const guard = new CheckoutSessionGuard();
      const sessionId = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId, approvalToken);

      const performClick = async () => { throw new Error('Simulated click timeout'); };

      // Force failure on SUBMISSION_UNCERTAIN append
      ledger.fsyncHook = async (event) => {
        if (event.type === 'SUBMISSION_UNCERTAIN') {
          throw new Error('EIO: failed writing SUBMISSION_UNCERTAIN');
        }
      };

      await assert.rejects(async () => {
        await ledger.executeDispatchBoundary({ sessionId, guard, performClick });
      }, /Simulated click timeout/);

      assert.ok(guard.uncertainSessions.has(sessionId));
      assert.equal(ledger.isLocked, true);
      assert.equal(ledger.lockReason, 'POST_DISPATCH_LEDGER_APPEND_FAILED');
    });

    test('BOUNDARY-FAIL-07: RECOVERY_ASSESSMENT persistence failure locks ledger and aborts startup', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);

      await ledger.append({ type: 'INTENT_PREPARED', sessionId: 'chk_assess_fail_test' });

      // Force failure on RECOVERY_ASSESSMENT append
      ledger.fsyncHook = async (event) => {
        if (event.type === 'RECOVERY_ASSESSMENT') {
          throw new Error('EACCES: read-only filesystem on recovery assessment');
        }
      };

      const recovery = await ledger.recoverOnStartup();
      assert.equal(recovery.status, 'LOCKED');
      assert.equal(recovery.reason, 'RECOVERY_ASSESSMENT_PERSISTENCE_FAILED');
      assert.equal(ledger.isLocked, true);
    });

  });

  describe('Production Runtime: Hardened Ledger Recovery & Contradiction Detection', () => {

    test('RECOVER-01: Non-monotonic sequence numbers lock ledger', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      // Seq jumps backwards (2 then 1)
      const content = '{"seq":2,"type":"SESSION_STARTED","sessionId":"chk_1","loggedAt":100}\n' +
                      '{"seq":1,"type":"INTENT_PREPARED","sessionId":"chk_1","loggedAt":200}\n';
      fs.writeFileSync(ledgerPath, content, 'utf8');

      const ledger = new CheckoutLedger(ledgerPath);
      const recovery = await ledger.recoverOnStartup();

      assert.equal(recovery.status, 'LOCKED');
      assert.equal(recovery.reason, 'NON_MONOTONIC_SEQUENCE_NUMBER');
      assert.equal(ledger.isLocked, true);
    });

    test('RECOVER-02: Missing required schema fields locks ledger', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      // Missing loggedAt
      const content = '{"seq":1,"type":"SESSION_STARTED","sessionId":"chk_1"}\n';
      fs.writeFileSync(ledgerPath, content, 'utf8');

      const ledger = new CheckoutLedger(ledgerPath);
      const recovery = await ledger.recoverOnStartup();

      assert.equal(recovery.status, 'LOCKED');
      assert.equal(recovery.reason, 'MALFORMED_EVENT_SCHEMA');
      assert.equal(ledger.isLocked, true);
    });

    test('RECOVER-03: Contradictory dispatch events (abort followed by dispatch returned) fail closed as UNCERTAIN', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      // Session has pre-click abort BUT ALSO has DISPATCH_CALL_RETURNED!
      const content = '{"seq":1,"type":"INTENT_PREPARED","sessionId":"chk_contra","loggedAt":100}\n' +
                      '{"seq":2,"type":"DISPATCH_MAY_HAVE_STARTED","sessionId":"chk_contra","loggedAt":101}\n' +
                      '{"seq":3,"type":"DISPATCH_ABORTED_PRE_CLICK","sessionId":"chk_contra","clickInvoked":false,"reason":"ERR","loggedAt":102}\n' +
                      '{"seq":4,"type":"DISPATCH_CALL_RETURNED","sessionId":"chk_contra","loggedAt":103}\n';
      fs.writeFileSync(ledgerPath, content, 'utf8');

      const ledger = new CheckoutLedger(ledgerPath);
      const recovery = await ledger.recoverOnStartup();

      assert.equal(recovery.status, 'RECOVERED');
      const assessment = recovery.assessments.find(a => a.sessionId === 'chk_contra');
      assert.equal(assessment.status, 'SUBMISSION_UNCERTAIN');
      assert.equal(assessment.canAutoRetry, false);
      assert.equal(assessment.mustReconcileManually, true);
    });

    test('RECOVER-04: Duplicate abort events in same session fail closed as UNCERTAIN', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const content = '{"seq":1,"type":"INTENT_PREPARED","sessionId":"chk_dup_abort","loggedAt":100}\n' +
                      '{"seq":2,"type":"DISPATCH_MAY_HAVE_STARTED","sessionId":"chk_dup_abort","loggedAt":101}\n' +
                      '{"seq":3,"type":"DISPATCH_ABORTED_PRE_CLICK","sessionId":"chk_dup_abort","clickInvoked":false,"reason":"ERR1","loggedAt":102}\n' +
                      '{"seq":4,"type":"DISPATCH_ABORTED_PRE_CLICK","sessionId":"chk_dup_abort","clickInvoked":false,"reason":"ERR2","loggedAt":103}\n';
      fs.writeFileSync(ledgerPath, content, 'utf8');

      const ledger = new CheckoutLedger(ledgerPath);
      const recovery = await ledger.recoverOnStartup();

      assert.equal(recovery.status, 'RECOVERED');
      const assessment = recovery.assessments.find(a => a.sessionId === 'chk_dup_abort');
      assert.equal(assessment.status, 'SUBMISSION_UNCERTAIN');
      assert.equal(assessment.canAutoRetry, false);
    });

    test('RECOVER-05: Corrupt trailing line is quarantined leaving original ledger intact', async () => {
      const ledgerPath = path.join(tempLedgerDir, 'checkout_ledger.jsonl');
      const ledger = new CheckoutLedger(ledgerPath);

      await ledger.append({ type: 'INTENT_PREPARED', sessionId: 'chk_corrupt_tail' });
      fs.appendFileSync(ledgerPath, '{"seq":2,"type":"DISPATCH_MAY_HAVE_S'); // Truncated line

      const recovery = await ledger.recoverOnStartup();
      assert.equal(recovery.status, 'RECOVERED');
      assert.equal(recovery.corruptTailQuarantined, true);

      // Original ledger file still contains all bytes
      const rawLedger = fs.readFileSync(ledgerPath, 'utf8');
      assert.ok(rawLedger.includes('{"seq":2,"type":"DISPATCH_MAY_HAVE_S'));

      // Sidecar file created
      const files = fs.readdirSync(tempLedgerDir);
      assert.ok(files.some(f => f.includes('.corrupt.')));
    });

  });

  describe('Production Runtime: Same-ASIN Retry Lockout While STILL_UNCERTAIN', () => {

    test('CRIT-17A: Same-ASIN retry remains permanently blocked while uncertain session is unresolved', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId1 = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId1, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId1, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId1, approvalToken);
      guard.recordIntentPrepared(sessionId1);
      guard.recordDispatchMayHaveStarted(sessionId1);
      guard.recordTerminalOutcome(sessionId1, 'UNCERTAIN', { reason: 'CONFIRMATION_TIMEOUT' });

      assert.throws(() => {
        guard.startSession('B09XYZ1234', 2500000);
      }, /ASIN_ATTEMPT_UNCERTAIN_LOCKED/);
    });

    test('CRIT-17B: Unrelated shopping for a DIFFERENT ASIN is permitted immediately', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId1 = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId1, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId1, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId1, approvalToken);
      guard.recordIntentPrepared(sessionId1);
      guard.recordDispatchMayHaveStarted(sessionId1);
      guard.recordTerminalOutcome(sessionId1, 'UNCERTAIN', { reason: 'CONFIRMATION_TIMEOUT' });

      const sessionId2 = guard.startSession('B08NEWITEM9', 1000000);
      assert.ok(sessionId2);
      assert.equal(guard.activeSession.targetAsin, 'B08NEWITEM9');
      assert.equal(guard.activeSession.state, STATES.CART_ISOLATED);
    });

    test('CRIT-17C: Same-ASIN retry permitted only when user accepts duplicate risk with supersedesAttemptId', () => {
      const guard = new CheckoutSessionGuard();
      const sessionId1 = guard.startSession('B09XYZ1234', 2500000);
      const snapResult = PurchaseSnapshotExtractor.extract({
        htmlString: spcReviewHtml,
        expectedAsin: 'B09XYZ1234',
        expectedQuantity: 1,
        approvedBudgetPaise: 2500000
      });
      guard.setReviewSnapshot(sessionId1, snapResult.snapshot);
      const { approvalToken } = guard.approvePurchase(sessionId1, snapResult.snapshot.snapshotId);
      guard.acquireSubmissionLock(sessionId1, approvalToken);
      guard.recordIntentPrepared(sessionId1);
      guard.recordDispatchMayHaveStarted(sessionId1);
      guard.recordTerminalOutcome(sessionId1, 'UNCERTAIN', { reason: 'CONFIRMATION_TIMEOUT' });

      guard.reconcileUncertainSession(sessionId1, 'USER_ACCEPTED_DUPLICATE_RISK', { userAcceptedRisk: true });

      const sessionId2 = guard.startSession('B09XYZ1234', 2500000, {
        supersedesAttemptId: sessionId1,
        userAcceptedDuplicateRisk: true
      });

      assert.ok(sessionId2);
      assert.equal(guard.activeSession.supersedesAttemptId, sessionId1);
      assert.equal(guard.activeSession.targetAsin, 'B09XYZ1234');
    });

  });

  // ==========================================================================
  // SECTION 2: DOCUMENTATION & INTERFACE CONTRACTS (NON-RUNTIME ASSERTIONS)
  // ==========================================================================

  describe('Suite B: Documentation & Interface Contracts (Non-Runtime Assertions)', () => {

    test('CONTRACT-01: amazon_select_payment for UPI must reject instant return and require review wait', () => {
      const expectedUpiResponseShape = {
        success: true,
        state: 'AWAITING_CUSTOMER_APPROVAL',
        snapshot: { asin: 'B09XYZ1234', totalPayablePaise: 1999000 }
      };
      assert.ok(expectedUpiResponseShape.state !== 'PAYMENT_SELECTED');
      assert.ok(expectedUpiResponseShape.snapshot.asin !== undefined);
    });

    test('CONTRACT-02: Confirmation wait must not resolve prematurely on missing button (btnGone elimination)', () => {
      const evaluateConfirmationSignal = (isThankYouUrl, hasConfirmText, btnExists, isBtnVisible) => {
        return isThankYouUrl || hasConfirmText;
      };
      const waitSatisfied = evaluateConfirmationSignal(false, false, false, false);
      assert.equal(waitSatisfied, false, 'Absence of button must NOT satisfy confirmation wait');
    });

    test('CONTRACT-03: amazon_place_order response schema must be strictly tri-state', () => {
      const validOutcomes = ['NOT_SUBMITTED', 'SUBMITTED_AND_CONFIRMED', 'SUBMISSION_UNCERTAIN'];
      const sampleResponse = {
        success: false,
        status: 'SUBMISSION_UNCERTAIN',
        error: 'Confirmation wait timed out'
      };
      assert.ok(validOutcomes.includes(sampleResponse.status));
      assert.equal(sampleResponse.success, false, 'Uncertain outcome must never report success: true');
    });

    test('CONTRACT-04: Manual card payment selection contract requires user handoff and blocks automated order placement', () => {
      const manualCardResponse = {
        success: true,
        state: 'REQUIRES_USER_HANDOFF',
        handoffReason: 'MANUAL_CARD_AUTHENTICATION',
        canPlaceOrderAutomatically: false
      };
      assert.equal(manualCardResponse.canPlaceOrderAutomatically, false);
      assert.equal(manualCardResponse.state, 'REQUIRES_USER_HANDOFF');
    });

    test('CONTRACT-05: Browser disconnect during confirmation wait must resolve to SUBMISSION_UNCERTAIN', () => {
      const handleConfirmationError = (err) => {
        if (err.message.includes('Target closed') || err.message.includes('disconnected')) {
          return {
            success: false,
            status: 'SUBMISSION_UNCERTAIN',
            error: 'Browser disconnected while awaiting confirmation: order status unknown'
          };
        }
        return { success: false, status: 'FAILED', error: err.message };
      };

      const outcome = handleConfirmationError(new Error('Navigation failed: Target closed (browser disconnected)'));
      assert.equal(outcome.status, 'SUBMISSION_UNCERTAIN');
      assert.equal(outcome.success, false);
    });

    test('CONTRACT-06: Synthetic tests do not claim live Amazon DOM proof', () => {
      const contractMetadata = {
        claimsLiveDomProof: false,
        requiresLiveInspectionInStage2C: true
      };
      assert.equal(contractMetadata.claimsLiveDomProof, false);
    });

  });

  // ==========================================================================
  // SECTION 3: REGRESSION & KNOWN DEFECT VERIFICATIONS (SOURCE-TEXT CHECKS ONLY)
  // ==========================================================================

  describe('Suite C: Regression & Known Defect Verifications in main.cjs (Source-Text Checks Only)', () => {

    test('GAP-DEF-01: Confirms main.cjs:2374 returns success immediately for UPI without review wait', () => {
      const mainContent = fs.readFileSync(path.join(__dirname, '../../backend/electron/main/main.cjs'), 'utf8');
      const hasUpiEarlyReturn = mainContent.includes("if (paymentMethod === 'upi')") &&
                                mainContent.includes("return { success: true, paymentSelected: 'upi' };");
      assert.equal(hasUpiEarlyReturn, true, 'Verified: main.cjs still contains Defect DEF-01 (UPI early return)');
    });

    test('GAP-DEF-02: Confirms main.cjs:2187 checkReviewPage returns true on generic /display.html or .spc-desktop', () => {
      const mainContent = fs.readFileSync(path.join(__dirname, '../../backend/electron/main/main.cjs'), 'utf8');
      const hasFlawedCheck = mainContent.includes("url.includes('/display.html')") &&
                             mainContent.includes("document.querySelector('.spc-desktop')") &&
                             mainContent.includes("return isReviewUrl || hasPlaceOrderButton || hasReviewContainer;");
      assert.equal(hasFlawedCheck, true, 'Verified: main.cjs still contains Defect DEF-02 (porous checkReviewPage)');
    });

    test('GAP-DEF-05: Confirms main.cjs:2869 evaluates btnGone === true when selector is missing', () => {
      const mainContent = fs.readFileSync(path.join(__dirname, '../../backend/electron/main/main.cjs'), 'utf8');
      const hasBtnGoneBug = mainContent.includes("const btnGone = btn ? !(btn.offsetWidth > 0 && btn.offsetHeight > 0) : true;");
      assert.equal(hasBtnGoneBug, true, 'Verified: main.cjs still contains Defect DEF-05 (btnGone bug)');
    });

    test('GAP-DEF-06: Confirms main.cjs:2901 returns success: true on unconfirmed order placement', () => {
      const mainContent = fs.readFileSync(path.join(__dirname, '../../backend/electron/main/main.cjs'), 'utf8');
      const hasDeceptiveSuccess = mainContent.includes("success: true,") &&
                                  mainContent.includes("message: orderPlaced ? '🎉 Order placed successfully!' : 'Order submitted — check your email!'");
      assert.equal(hasDeceptiveSuccess, true, 'Verified: main.cjs still contains Defect DEF-06 (deceptive success)');
    });

  });

});
