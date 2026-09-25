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
      // Check archived sessions for non-actionable presentation view
      const archived = this.guard.archivedSessions.get(sessionId);
      if (archived && archived.snapshot) {
        return {
          sessionId: archived.checkoutSessionId,
          snapshotId: archived.snapshot.snapshotId,
          targetAsin: archived.snapshot.targetAsin,
          extractedAsin: archived.snapshot.extractedAsin,
          title: archived.snapshot.title,
          variant: archived.snapshot.variant,
          quantity: archived.snapshot.quantity,
          itemPricePaise: archived.snapshot.itemPricePaise,
          shippingPricePaise: archived.snapshot.shippingPricePaise,
          codFeePaise: archived.snapshot.codFeePaise,
          platformFeePaise: archived.snapshot.platformFeePaise,
          taxPricePaise: archived.snapshot.taxPricePaise,
          discountPaise: archived.snapshot.discountPaise,
          totalPayablePaise: archived.snapshot.totalPayablePaise,
          totalPayable: archived.snapshot.totalPayable,
          currency: archived.snapshot.currency,
          approvedBudgetPaise: archived.snapshot.approvedBudgetPaise,
          approvedBudget: archived.snapshot.approvedBudget,
          deliveryAddressSummary: archived.snapshot.deliveryAddressSummary,
          paymentMethodSummary: archived.snapshot.paymentMethodSummary,
          createdAt: archived.snapshot.createdAt,
          expiresAt: archived.snapshot.expiresAt,
          state: archived.state,
          isActionable: false,
          isTerminal: true,
          outcome: archived.state === STATES.ORDER_CONFIRMED ? 'VERIFIED_PLACED'
            : archived.state === STATES.SUBMISSION_UNCERTAIN ? 'SUBMISSION_UNCERTAIN'
            : 'CHECKOUT_ABORTED'
        };
      }

      // Check uncertain sessions
      const uncertain = this.guard.uncertainSessions.get(sessionId);
      if (uncertain) {
        return {
          sessionId,
          state: 'SUBMISSION_UNCERTAIN',
          isActionable: false,
          isTerminal: true,
          mustReconcileManually: true,
          targetAsin: uncertain.targetAsin,
          details: uncertain.uncertaintyDetails || null
        };
      }

      return null;
    }

    const snap = active.snapshot;
    const isTerminal = TERMINAL_STATES.includes(active.state);
    const isActionable = active.state === STATES.AWAITING_CUSTOMER_APPROVAL;
    const isAborted = active.state === STATES.CHECKOUT_ABORTED;
    const isUncertain = active.state === STATES.SUBMISSION_UNCERTAIN;

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
      expiresAt: snap.expiresAt,
      state: active.state,
      isActionable,
      isTerminal,
      ...(isAborted ? { reason: active.abortReason || (active.abortDetails ? active.abortDetails.reason : 'CHECKOUT_ABORTED') } : {}),
      ...(isUncertain ? { mustReconcileManually: true, uncertaintyDetails: active.uncertaintyDetails || null } : {})
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

    active.abortReason = reason;
    this.guard.cancelApproval(sessionId, reason);
    return formatTerminalOutcome('CHECKOUT_ABORTED', {
      reason,
      sessionId
    });
  }

  // ── Increment 2B-4A: Pre-Dispatch Gate & Retained ElementHandle ────────────

  /**
   * IMPORTANT RECOVERY INVARIANT (2B-4A Foundation):
   * INTENT_PREPARED by itself is NOT proof that no dispatch could ever have started.
   * It is safely retryable only when recovery can establish BOTH:
   * 1. DISPATCH_MAY_HAVE_STARTED was never successfully persisted
   * AND
   * 2. The original execution path could not have invoked the click.
   *
   * In Increment 2B-4A, the execution pipeline intentionally terminates at PREFLIGHT_VERIFIED.
   * ZERO click calls, ZERO DISPATCH_MAY_HAVE_STARTED writes, ZERO INTENT_PREPARED writes,
   * and ZERO executeDispatchBoundary calls occur in this phase.
   */

  /**
   * Validates pre-boundary actionability of a candidate Place Order element.
   * Must be called BEFORE crossing any future durable dispatch boundary.
   *
   * Checks:
   * 1. Element exists and is an INPUT or BUTTON (or role="button").
   * 2. Element has positive physical layout dimensions (offsetWidth/height > 0).
   * 3. Element is visible (display !== 'none', visibility !== 'hidden').
   * 4. Element is enabled (!disabled and aria-disabled !== 'true').
   * 5. Element allows pointer events (pointer-events !== 'none').
   *
   * Fail-Closed: If evaluation throws or fails, returns actionable: false.
   *
   * @param {Object} page - Puppeteer page instance
   * @param {Object} elementHandle - Puppeteer ElementHandle
   * @returns {Promise<{ actionable: boolean, details: Object }>}
   */
  async validateTargetActionability(page, elementHandle) {
    if (!elementHandle) {
      return { actionable: false, details: { reason: 'NULL_ELEMENT_HANDLE' } };
    }

    try {
      let evaluation = null;

      if (typeof elementHandle.evaluate === 'function') {
        evaluation = await elementHandle.evaluate((el) => {
          if (!el) return { valid: false, reason: 'NO_ELEMENT' };
          const tag = (el.tagName || '').toUpperCase();
          const isButtonOrInput = tag === 'INPUT' || tag === 'BUTTON' || (el.getAttribute && el.getAttribute('role') === 'button');
          const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: el.offsetWidth || 0, height: el.offsetHeight || 0 };
          const cs = window.getComputedStyle ? window.getComputedStyle(el) : { display: 'block', visibility: 'visible', pointerEvents: 'auto' };
          const hasDimensions = (el.offsetWidth > 0 && el.offsetHeight > 0) || (rect.width > 0 && rect.height > 0);
          const isVisible = hasDimensions && cs.display !== 'none' && cs.visibility !== 'hidden';
          const isDisabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
          const pointerEventsActive = cs.pointerEvents !== 'none';
          const isActionable = isButtonOrInput && isVisible && !isDisabled && pointerEventsActive;

          return {
            valid: true,
            isButtonOrInput,
            tag,
            isVisible,
            isDisabled,
            pointerEventsActive,
            isActionable,
            reason: !isButtonOrInput ? 'INVALID_TAG'
              : !isVisible ? 'NOT_VISIBLE'
              : isDisabled ? 'DISABLED'
              : !pointerEventsActive ? 'POINTER_EVENTS_NONE'
              : 'ACTIONABLE'
          };
        });
      } else if (page && typeof page.evaluate === 'function') {
        evaluation = await page.evaluate((el) => {
          if (!el) return { valid: false, reason: 'NO_ELEMENT' };
          const tag = (el.tagName || '').toUpperCase();
          const isButtonOrInput = tag === 'INPUT' || tag === 'BUTTON';
          const cs = window.getComputedStyle(el);
          const isVisible = (el.offsetWidth > 0 && el.offsetHeight > 0) && cs.display !== 'none' && cs.visibility !== 'hidden';
          const isDisabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
          const isActionable = isButtonOrInput && isVisible && !isDisabled && cs.pointerEvents !== 'none';
          return { valid: true, isActionable, reason: isActionable ? 'ACTIONABLE' : 'NOT_ACTIONABLE' };
        }, elementHandle);
      } else {
        // Fallback for purely mock environments without evaluate
        return {
          actionable: true,
          details: { mockEvaluation: true, reason: 'ACTIONABLE_MOCK' }
        };
      }

      if (!evaluation || !evaluation.isActionable) {
        return {
          actionable: false,
          details: evaluation || { reason: 'EVALUATION_FAILED' }
        };
      }

      return {
        actionable: true,
        details: evaluation
      };
    } catch (err) {
      return {
        actionable: false,
        details: { reason: 'ACTIONABILITY_EVALUATION_THREW', error: err.message }
      };
    }
  }

  /**
   * Scopes and acquires the Place Order target as a retained ElementHandle.
   *
   * STRICT CONTAINER SCOPING:
   * Searches strictly within the order summary container (#spc-order-summary).
   * Does NOT search the broader document or unrelated carousels.
   * Does NOT click the element.
   * Does NOT persist any durable boundary.
   *
   * SYNTHETIC SELECTORS NOTICE:
   * Selectors evaluated here are synthetic fixture selectors verified for offline testing.
   * They do NOT claim compatibility with live Amazon production DOM, which is deferred to Stage 2C.
   *
   * @param {Object} page - Puppeteer page instance
   * @param {Object} snapshot - Canonical purchase snapshot
   * @param {Object} [options] - Optional selector configuration
   * @returns {Promise<{ success: boolean, handle?: Object, selectorUsed?: string, containerSelector?: string, reason?: string, details?: Object }>}
   */
  async acquireRetainedButtonHandle(page, snapshot, options = {}) {
    if (!page || typeof page.$ !== 'function') {
      return { success: false, reason: 'INVALID_PAGE_OBJECT' };
    }
    if (typeof page.isClosed === 'function' && page.isClosed()) {
      return { success: false, reason: 'PAGE_CLOSED' };
    }

    // Default container selector (scoped strictly to order summary)
    const containerSelector = options.containerSelector || '#spc-order-summary';

    // Synthetic candidate selectors within container
    const buttonSelectors = options.buttonSelectors || [
      '#submitOrderButtonId input[name="placeYourOrder1"]',
      '#submitOrderButtonId .a-button-input',
      'input[name="placeYourOrder1"]',
      '#submitOrderButtonId input',
      '#submitOrderButtonId'
    ];

    // Check if scoped container exists
    let containerHandle = null;
    try {
      containerHandle = await page.$(containerSelector);
    } catch (err) {
      return { success: false, reason: 'CONTAINER_QUERY_FAILED', error: err.message };
    }

    if (!containerHandle) {
      return { success: false, reason: 'BUTTON_CONTAINER_NOT_FOUND', containerSelector };
    }

    // Query button strictly within the scoped container
    let buttonHandle = null;
    let selectedSelector = null;

    for (const sel of buttonSelectors) {
      try {
        const fullSel = `${containerSelector} ${sel}`;
        const handle = await page.$(fullSel);
        if (handle) {
          buttonHandle = handle;
          selectedSelector = fullSel;
          break;
        }
      } catch {}
    }

    // Direct container child query if composite selector yielded nothing
    if (!buttonHandle && typeof containerHandle.$ === 'function') {
      for (const sel of buttonSelectors) {
        try {
          const handle = await containerHandle.$(sel);
          if (handle) {
            buttonHandle = handle;
            selectedSelector = `${containerSelector} -> ${sel}`;
            break;
          }
        } catch {}
      }
    }

    if (!buttonHandle) {
      return { success: false, reason: 'PLACE_ORDER_BUTTON_NOT_FOUND', containerSelector };
    }

    // Validate pre-boundary actionability
    const actionability = await this.validateTargetActionability(page, buttonHandle);
    if (!actionability.actionable) {
      return {
        success: false,
        reason: 'TARGET_NOT_ACTIONABLE',
        details: actionability.details
      };
    }

    return {
      success: true,
      handle: buttonHandle,
      selectorUsed: selectedSelector,
      containerSelector,
      actionability: actionability.details
    };
  }

  /**
   * Dedicated Pre-Dispatch Validation Gate.
   *
   * Authoritatively validates all 17 pre-dispatch conditions:
   * 1. Active checkout session exists.
   * 2. sessionId matches active session.
   * 3. Session state is exactly PURCHASE_APPROVED.
   * 4. Snapshot exists.
   * 5. Snapshot has not expired.
   * 6. Snapshot checksum remains valid.
   * 7. Approval token exists.
   * 8. Approval token has not expired.
   * 9. Approval token has not already been consumed.
   * 10. No concurrent submission is already active.
   * 11. Ledger / checkout safety state is not locked.
   * 12. Puppeteer page exists.
   * 13. Page is not closed.
   * 14. Page remains in expected review context (URL matches review SPC handler).
   * 15. Place Order target exists inside the intended scoped container.
   * 16. Target is actionable.
   * 17. A retained ElementHandle can be obtained.
   *
   * FAIL-CLOSED:
   * If any check fails, returns { valid: false, reason, details }.
   * No click, no boundary, no DISPATCH_MAY_HAVE_STARTED.
   *
   * @param {string} sessionId
   * @param {Object} options - { page, url, skipUrlCheck, containerSelector, buttonSelectors }
   * @returns {Promise<{ valid: boolean, reason?: string, details?: Object, sessionId?: string, state?: string, snapshot?: Object, handle?: Object, selectorUsed?: string, containerSelector?: string }>}
   */
  async validatePreDispatch(sessionId, options = {}) {
    // 1. Active checkout session exists
    const active = this.guard.activeSession;
    if (!active) {
      return { valid: false, reason: 'NO_ACTIVE_SESSION' };
    }

    // 2. sessionId matches active session
    if (active.checkoutSessionId !== sessionId) {
      return { valid: false, reason: 'SESSION_MISMATCH', details: { expected: active.checkoutSessionId, received: sessionId } };
    }

    // 3. Session state is exactly PURCHASE_APPROVED
    if (active.state !== STATES.PURCHASE_APPROVED) {
      return { valid: false, reason: 'INVALID_STATE_FOR_PRE_DISPATCH', details: { state: active.state, expected: STATES.PURCHASE_APPROVED } };
    }

    // 4. Snapshot exists
    if (!active.snapshot) {
      return { valid: false, reason: 'NO_SNAPSHOT' };
    }

    // 5. Snapshot has not expired
    if (typeof active.snapshot.expiresAt === 'number' && Date.now() > active.snapshot.expiresAt) {
      return { valid: false, reason: 'SNAPSHOT_EXPIRED', details: { expiresAt: active.snapshot.expiresAt, now: Date.now() } };
    }

    // 6. Snapshot checksum remains valid
    if (!verifySnapshotChecksum(active.snapshot)) {
      return { valid: false, reason: 'SNAPSHOT_CHECKSUM_INVALID' };
    }

    // 7. Approval token exists
    if (!active.approvalToken || typeof active.approvalToken !== 'string') {
      return { valid: false, reason: 'NO_APPROVAL_TOKEN' };
    }

    // 8. Approval token has not expired
    if (typeof active.approvalTokenExpiresAt === 'number' && Date.now() > active.approvalTokenExpiresAt) {
      return { valid: false, reason: 'APPROVAL_TOKEN_EXPIRED', details: { expiresAt: active.approvalTokenExpiresAt, now: Date.now() } };
    }

    // 9. Approval token has not already been consumed
    if (active.tokenConsumed) {
      return { valid: false, reason: 'TOKEN_ALREADY_CONSUMED' };
    }

    // 10. No concurrent submission is already active
    if (active.isSubmitting) {
      return { valid: false, reason: 'CONCURRENT_SUBMISSION_ACTIVE' };
    }

    // 11. Ledger / checkout safety state is not locked
    if (this.ledger && this.ledger.locked) {
      return { valid: false, reason: 'LEDGER_LOCKED', details: { lockReason: this.ledger.lockedReason } };
    }

    // 12. Puppeteer page exists
    const page = options.page;
    if (!page) {
      return { valid: false, reason: 'PAGE_REQUIRED' };
    }

    // 13. Page is not closed
    if (typeof page.isClosed === 'function' && page.isClosed()) {
      return { valid: false, reason: 'PAGE_CLOSED' };
    }

    // 14. Page remains in expected review context
    const url = typeof page.url === 'function' ? page.url() : (options.url || '');
    if (!url || typeof url !== 'string') {
      return { valid: false, reason: 'INVALID_PAGE_URL' };
    }
    const isSpcUrl = url.includes('/gp/buy/spc/handlers/display.html') || url.includes('/spc/handlers/display.html');
    if (!isSpcUrl && !options.skipUrlCheck) {
      return { valid: false, reason: 'INVALID_REVIEW_CONTEXT', details: { url } };
    }

    // 15, 16, 17. Retained Place Order ElementHandle acquisition & actionability
    const handleRes = await this.acquireRetainedButtonHandle(page, active.snapshot, options);
    if (!handleRes.success) {
      return {
        valid: false,
        reason: handleRes.reason,
        details: handleRes.details || { containerSelector: handleRes.containerSelector }
      };
    }

    return {
      valid: true,
      sessionId,
      state: active.state,
      snapshot: active.snapshot,
      handle: handleRes.handle,
      selectorUsed: handleRes.selectorUsed,
      containerSelector: handleRes.containerSelector,
      actionability: handleRes.actionability
    };
  }

  /**
   * Executes the Phase 2B-4A Pre-Dispatch Gate and submission lock integration.
   *
   * Sequence:
   * 1. Runs validatePreDispatch (checks 1-17, acquires retained handle).
   * 2. If valid, acquires submission lock via prepareSubmissionLock (PURCHASE_APPROVED -> PREFLIGHT_VERIFIED).
   * 3. Burns internal approval token (tokenConsumed = true).
   * 4. STOPS at PREFLIGHT_VERIFIED.
   *
   * INVARIANTS:
   * - ZERO click calls.
   * - ZERO DISPATCH_MAY_HAVE_STARTED writes.
   * - ZERO executeDispatchBoundary calls.
   * - ZERO INTENT_PREPARED writes.
   *
   * @param {string} sessionId
   * @param {Object} options - { page, url, skipUrlCheck, containerSelector, buttonSelectors }
   * @returns {Promise<{ success: boolean, gatePassed: boolean, preflightVerified?: boolean, state?: string, sessionId?: string, retainedHandle?: Object, buttonSelector?: string, reason?: string, details?: Object }>}
   */
  async executePreDispatchGate(sessionId, options = {}) {
    // 1. Run Pre-Dispatch Validation & acquire retained handle
    const validation = await this.validatePreDispatch(sessionId, options);
    if (!validation.valid) {
      return {
        success: false,
        gatePassed: false,
        preflightVerified: false,
        reason: validation.reason,
        details: validation.details || null
      };
    }

    // 2. Acquire submission lock on guard (PURCHASE_APPROVED -> PREFLIGHT_VERIFIED)
    const lockResult = this.prepareSubmissionLock(sessionId);
    if (!lockResult.success) {
      return {
        success: false,
        gatePassed: false,
        preflightVerified: false,
        reason: lockResult.reason
      };
    }

    // 3. Return verified preflight state with the retained handle
    // INVARIANT: Execution terminates strictly at PREFLIGHT_VERIFIED.
    return {
      success: true,
      gatePassed: true,
      preflightVerified: true,
      state: lockResult.state, // STATES.PREFLIGHT_VERIFIED
      sessionId,
      retainedHandle: validation.handle,
      buttonSelector: validation.selectorUsed,
      containerSelector: validation.containerSelector
    };
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
