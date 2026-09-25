/**
 * Buddy AI — Checkout Coordinator (Increment 2B-1 Foundation)
 * 
 * Module: backend/electron/checkout/CheckoutCoordinator.cjs
 * 
 * Orchestration boundary between the Electron runtime / IPC layer
 * and the frozen Checkout Safety Engine (Increment 2A).
 * 
 * INVARIANTS:
 * 1. Zero Renderer Trust: Renderer provides only session/snapshot identifiers or user intent.
 *    Financial facts, ASIN, quantity, and budget are strictly authoritative from backend memory
 *    and validated by SHA-256 canonical checksums.
 * 2. Backend-Owned Approval: Approval tokens are generated and held strictly in Node.js heap.
 *    Tokens are NEVER exposed to the renderer or accepted from external callers.
 * 3. Fail-Closed Review: Review pages must pass ReviewEvidenceEvaluator.evaluate() strictly.
 *    Porous checks (/display.html or .spc-desktop alone) are rejected.
 * 4. Dispatch Boundary Integrity: 2B-1 prepares the submission lock through the frozen guard
 *    but NEVER crosses the point-of-no-return dispatch boundary or invokes Place Order.
 * 5. Authoritative Terminal Outcome Contract: Outcomes are strictly one of:
 *    - VERIFIED_PLACED
 *    - CHECKOUT_ABORTED
 *    - SUBMISSION_UNCERTAIN
 *    Convenience boolean properties (success, orderPlaced, uncertain) are deterministically
 *    derived and never contradict outcome.
 */

'use strict';

const {
  ReviewEvidenceEvaluator,
  PurchaseSnapshotExtractor,
  CheckoutSessionGuard,
  CheckoutLedger,
  verifySnapshotChecksum,
  STATES,
  TERMINAL_STATES
} = require('./CheckoutSafetyEngine.cjs');

// ============================================================================
// 1. TERMINAL OUTCOME UTILITY
// ============================================================================

const AUTHORITATIVE_OUTCOMES = Object.freeze([
  'VERIFIED_PLACED',
  'CHECKOUT_ABORTED',
  'SUBMISSION_UNCERTAIN'
]);

/**
 * Formats terminal results where convenience boolean fields are
 * deterministically derived from the authoritative `outcome` field.
 */
function formatTerminalOutcome(outcome, details = {}) {
  if (!AUTHORITATIVE_OUTCOMES.includes(outcome)) {
    throw new Error(`INVALID_TERMINAL_OUTCOME: ${outcome}`);
  }

  const isPlaced = outcome === 'VERIFIED_PLACED';
  const isUncertain = outcome === 'SUBMISSION_UNCERTAIN';

  return {
    outcome,
    ...details,
    success: isPlaced,
    orderPlaced: isPlaced,
    uncertain: isUncertain
  };
}

// ============================================================================
// 2. CHECKOUT COORDINATOR CLASS
// ============================================================================

class CheckoutCoordinator {
  /**
   * @param {Object} options
   * @param {CheckoutSessionGuard} [options.guard] - Optional injected guard (defaults to new instance)
   * @param {CheckoutLedger} [options.ledger] - Optional injected ledger
   * @param {string} [options.ledgerPath] - Path to append-only JSONL ledger file
   */
  constructor(options = {}) {
    this.guard = options.guard || new CheckoutSessionGuard();
    this.ledger = options.ledger || (options.ledgerPath ? new CheckoutLedger(options.ledgerPath) : null);
  }

  // ── Session Lifecycle ──────────────────────────────────────────────────────

  /**
   * Initializes a new checkout session on the authoritative guard.
   * Enforces same-ASIN lockout if the previous session for that ASIN was uncertain.
   * 
   * @param {string} targetAsin - Expected Amazon 10-char ASIN
   * @param {number|string} [approvedBudget] - Budget ceiling in INR
   * @param {Object} [options] - Optional override flags (e.g. supersedesAttemptId, userAcceptedDuplicateRisk)
   * @returns {{ success: boolean, sessionId?: string, error?: string }}
   */
  startSession(targetAsin, approvedBudget, options = {}) {
    if (!targetAsin || typeof targetAsin !== 'string') {
      return { success: false, error: 'TARGET_ASIN_REQUIRED' };
    }

    try {
      const sessionId = this.guard.startSession(targetAsin, approvedBudget, options);
      return { success: true, sessionId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Retrieves current session state info from the guard.
   * @returns {Object|null}
   */
  getActiveSessionInfo() {
    const s = this.guard.activeSession;
    if (!s) return null;

    return {
      checkoutSessionId: s.checkoutSessionId,
      targetAsin: s.targetAsin,
      state: s.state,
      approvedBudget: s.approvedBudget,
      hasSnapshot: !!s.snapshot,
      snapshotId: s.snapshot ? s.snapshot.snapshotId : null,
      isSubmitting: s.isSubmitting,
      tokenConsumed: s.tokenConsumed
    };
  }

  // ── Review Evidence & Snapshot Extraction ──────────────────────────────────

  /**
   * Evaluates the DOM and URL of the checkout page using ReviewEvidenceEvaluator.
   * Fails closed if review evidence is not strictly VERIFIED.
   * 
   * @param {string} htmlString - Raw DOM HTML from page
   * @param {string} url - Current page URL
   * @returns {{ verified: boolean, status: string, reason: string, negativeSignals?: string[] }}
   */
  evaluateReviewPage(htmlString, url) {
    if (!htmlString || typeof htmlString !== 'string' || !url || typeof url !== 'string') {
      return { verified: false, status: 'NOT_VERIFIED', reason: 'INVALID_PAGE_PAYLOAD' };
    }

    const evaluation = ReviewEvidenceEvaluator.evaluate(htmlString, url);
    return {
      verified: evaluation.status === 'VERIFIED',
      status: evaluation.status,
      reason: evaluation.reason,
      negativeSignals: evaluation.negativeSignals || []
    };
  }

  /**
   * Evaluates review page, extracts canonical purchase snapshot, and binds it
   * to the active session in the guard.
   * 
   * @param {string} sessionId - Active session ID
   * @param {Object} pagePayload - { htmlString, url, boundPageId }
   * @returns {{ success: boolean, safeView?: Object, reason?: string, error?: string }}
   */
  extractAndBindReviewSnapshot(sessionId, pagePayload = {}) {
    const active = this.guard.activeSession;
    if (!active || active.checkoutSessionId !== sessionId) {
      return { success: false, reason: 'SESSION_NOT_FOUND' };
    }

    const { htmlString, url, boundPageId } = pagePayload;

    // 1. Strict Evidence Evaluation
    const evalResult = this.evaluateReviewPage(htmlString, url);
    if (!evalResult.verified) {
      return {
        success: false,
        reason: 'REVIEW_EVIDENCE_NOT_VERIFIED',
        evaluationStatus: evalResult.status,
        evaluationReason: evalResult.reason,
        negativeSignals: evalResult.negativeSignals
      };
    }

    // 2. Canonical Purchase Snapshot Extraction
    let extractionResult;
    try {
      extractionResult = PurchaseSnapshotExtractor.extract({
        htmlString,
        expectedAsin: active.targetAsin,
        expectedQuantity: 1,
        approvedBudgetPaise: active.approvedBudgetPaise,
        checkoutSessionId: sessionId,
        boundPageId: boundPageId || 'page_electron_active'
      });
    } catch (err) {
      return { success: false, reason: 'SNAPSHOT_EXTRACTION_THREW', error: err.message };
    }

    if (!extractionResult || !extractionResult.success) {
      return {
        success: false,
        reason: extractionResult ? extractionResult.reason : 'SNAPSHOT_EXTRACTION_FAILED',
        details: extractionResult
      };
    }

    // 3. Bind Snapshot to Guard
    try {
      this.guard.setReviewSnapshot(sessionId, extractionResult.snapshot);
    } catch (err) {
      return { success: false, reason: 'SNAPSHOT_BINDING_FAILED', error: err.message };
    }

    // 4. Return strictly the safe presentation view (NO approval tokens, NO raw DOM, NO checksums)
    const safeView = this.getSafeReviewView(sessionId);
    return {
      success: true,
      safeView
    };
  }

  /**
   * Exposes a presentation-only safe view of the verified snapshot for renderer UI.
   * Strips all internal security tokens, checksums, and secret state.
   * 
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSafeReviewView(sessionId) {
    const active = this.guard.activeSession;
    if (!active || active.checkoutSessionId !== sessionId || !active.snapshot) {
      return null;
    }

    const snap = active.snapshot;
    return {
      sessionId: active.checkoutSessionId,
      snapshotId: snap.snapshotId,
      targetAsin: snap.targetAsin,
      extractedAsin: snap.extractedAsin,
      title: snap.title,
      variant: snap.variant,
      quantity: snap.quantity,
      itemPricePaise: snap.itemPricePaise,
      shippingPricePaise: snap.shippingPricePaise,
      codFeePaise: snap.codFeePaise,
      platformFeePaise: snap.platformFeePaise,
      taxPricePaise: snap.taxPricePaise,
      discountPaise: snap.discountPaise,
      totalPayablePaise: snap.totalPayablePaise,
      totalPayable: snap.totalPayable,
      currency: snap.currency,
      approvedBudgetPaise: snap.approvedBudgetPaise,
      approvedBudget: snap.approvedBudget,
      deliveryAddressSummary: snap.deliveryAddressSummary,
      paymentMethodSummary: snap.paymentMethodSummary,
      createdAt: snap.createdAt,
      expiresAt: snap.expiresAt
    };
  }

  // ── Backend-Authoritative Approval & Submission Lock ───────────────────────

  /**
   * Processes a user request to approve the current purchase snapshot.
   * 
   * ZERO-TRUST RULE:
   * The userRequest is strictly a trigger to approve that snapshotId.
   * Any client-supplied financial figures, tokens, or claims of prior approval
   * are completely ignored. All authorization is derived from the backend canonical snapshot.
   * 
   * @param {string} sessionId
   * @param {Object} userRequest - { snapshotId }
   * @returns {{ success: boolean, approved?: boolean, sessionId?: string, snapshotId?: string, reason?: string }}
   */
  processUserApproval(sessionId, userRequest = {}) {
    const active = this.guard.activeSession;
    if (!active || active.checkoutSessionId !== sessionId) {
      return { success: false, reason: 'SESSION_MISMATCH' };
    }

    if (!userRequest || typeof userRequest !== 'object') {
      return { success: false, reason: 'INVALID_APPROVAL_REQUEST' };
    }

    const snapshotId = userRequest.snapshotId;
    if (!snapshotId || typeof snapshotId !== 'string') {
      return { success: false, reason: 'SNAPSHOT_ID_REQUIRED' };
    }

    // Call authoritative guard to approve purchase and issue internal token
    const approvalResult = this.guard.approvePurchase(sessionId, snapshotId);
    if (!approvalResult.success) {
      return { success: false, reason: approvalResult.reason };
    }

    // TOKEN PROTECTION:
    // The approvalToken is retained strictly in this.guard.activeSession.approvalToken (Node.js heap).
    // It is NEVER returned in this payload or exposed to the renderer!
    return {
      success: true,
      approved: true,
      sessionId,
      snapshotId
    };
  }

  /**
   * Prepares and acquires the single-use submission lock for the approved session.
   * Retrieves the backend-held internal approval token from the guard.
   * 
   * @param {string} sessionId
   * @returns {{ success: boolean, locked?: boolean, state?: string, reason?: string }}
   */
  prepareSubmissionLock(sessionId) {
    const active = this.guard.activeSession;
    if (!active || active.checkoutSessionId !== sessionId) {
      return { success: false, reason: 'SESSION_MISMATCH' };
    }

    const internalToken = active.approvalToken;
    if (!internalToken) {
      return { success: false, reason: 'NO_INTERNAL_APPROVAL_TOKEN' };
    }

    const lockResult = this.guard.acquireSubmissionLock(sessionId, internalToken);
    if (!lockResult.allowed) {
      return { success: false, reason: lockResult.reason };
    }

    return {
      success: true,
      locked: true,
      state: active.state
    };
  }

  /**
   * Cancels checkout prior to dispatch boundary, immediately revoking approval
   * and releasing locks.
   * 
   * @param {string} sessionId
   * @param {string} [reason='USER_CANCELLED']
   * @returns {Object} Authoritative terminal outcome: CHECKOUT_ABORTED
   */
  cancelCheckout(sessionId, reason = 'USER_CANCELLED') {
    const active = this.guard.activeSession;
    if (!active || active.checkoutSessionId !== sessionId) {
      return formatTerminalOutcome('CHECKOUT_ABORTED', {
        reason: 'SESSION_NOT_FOUND',
        sessionId
      });
    }

    this.guard.cancelApproval(sessionId, reason);
    return formatTerminalOutcome('CHECKOUT_ABORTED', {
      reason,
      sessionId
    });
  }

  // ── Recovery & Terminal Contract ───────────────────────────────────────────

  /**
   * Recovers uncompleted sessions across application restarts using durable disk evidence.
   * Delegates directly to the frozen CheckoutLedger.
   * 
   * @returns {Promise<Object>} Recovery assessment result from ledger
   */
  async recoverStartup() {
    if (!this.ledger) {
      return { status: 'NO_LEDGER_CONFIGURED', sessions: [] };
    }

    return await this.ledger.recoverOnStartup();
  }

  /**
   * Retrieves the terminal outcome of a session if completed, or null if in-flight.
   * 
   * @param {string} sessionId
   * @returns {Object|null} Formatted terminal outcome conforming strictly to 2B contract
   */
  getTerminalOutcome(sessionId) {
    // Check active session (if terminal state reached)
    if (this.guard.activeSession && this.guard.activeSession.checkoutSessionId === sessionId) {
      const state = this.guard.activeSession.state;
      if (TERMINAL_STATES.includes(state)) {
        const outcome = state === STATES.ORDER_CONFIRMED ? 'VERIFIED_PLACED'
          : state === STATES.SUBMISSION_UNCERTAIN ? 'SUBMISSION_UNCERTAIN'
          : 'CHECKOUT_ABORTED';
        return formatTerminalOutcome(outcome, { sessionId, state });
      }
      return null; // Still in-flight
    }

    // Check archived sessions
    const archived = this.guard.archivedSessions.get(sessionId);
    if (archived) {
      const state = archived.state;
      const outcome = state === STATES.ORDER_CONFIRMED ? 'VERIFIED_PLACED'
        : state === STATES.SUBMISSION_UNCERTAIN ? 'SUBMISSION_UNCERTAIN'
        : 'CHECKOUT_ABORTED';
      return formatTerminalOutcome(outcome, {
        sessionId,
        state,
        orderId: archived.reconciliation ? archived.reconciliation.orderId : undefined,
        reason: archived.abortDetails ? archived.abortDetails.reason : undefined
      });
    }

    // Check uncertain sessions
    const uncertain = this.guard.uncertainSessions.get(sessionId);
    if (uncertain) {
      return formatTerminalOutcome('SUBMISSION_UNCERTAIN', {
        sessionId,
        targetAsin: uncertain.targetAsin,
        details: uncertain.uncertaintyDetails
      });
    }

    return null;
  }
}

module.exports = {
  CheckoutCoordinator,
  formatTerminalOutcome,
  AUTHORITATIVE_OUTCOMES
};
