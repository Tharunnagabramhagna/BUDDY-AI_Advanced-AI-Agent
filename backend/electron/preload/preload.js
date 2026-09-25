const isElectron = !!(process.versions && process.versions.electron);
let electron = null;
try {
    electron = isElectron ? require("electron") : null;
} catch {
    electron = null;
}
const contextBridge = electron?.contextBridge;
const ipcRenderer = electron?.ipcRenderer;

console.log("Buddy preload bridge loaded");

/**
 * ZERO-TRUST SANITIZER:
 * Strips all caller-supplied financial values, quantities, ASINs, tokens, and checksums.
 * Only forwards validated sessionId and snapshotId.
 */
function sanitizeApprovalRequest(request) {
    if (!request || typeof request !== 'object') {
        throw new Error('INVALID_APPROVAL_REQUEST: Payload must be an object');
    }
    if (typeof request.sessionId !== 'string' || !request.sessionId.trim()) {
        throw new Error('INVALID_APPROVAL_REQUEST: sessionId must be a non-empty string');
    }
    if (typeof request.snapshotId !== 'string' || !request.snapshotId.trim()) {
        throw new Error('INVALID_APPROVAL_REQUEST: snapshotId must be a non-empty string');
    }
    return {
        sessionId: request.sessionId.trim(),
        snapshotId: request.snapshotId.trim()
    };
}

function sanitizeCancelRequest(request) {
    if (!request || typeof request !== 'object') {
        throw new Error('INVALID_CANCEL_REQUEST: Payload must be an object');
    }
    if (typeof request.sessionId !== 'string' || !request.sessionId.trim()) {
        throw new Error('INVALID_CANCEL_REQUEST: sessionId must be a non-empty string');
    }
    return {
        sessionId: request.sessionId.trim()
    };
}

function createBuddyAgentBridge(renderer = ipcRenderer) {
    return {
        execute: (action) => renderer ? renderer.invoke('execute-agent', action) : Promise.reject(new Error('NO_IPC_RENDERER')),
        checkoutStep: (action) => renderer ? renderer.invoke('agent-checkout-step', action) : Promise.reject(new Error('NO_IPC_RENDERER')),
        approvePurchase: (request) => {
            try {
                const sanitized = sanitizeApprovalRequest(request);
                return renderer ? renderer.invoke('checkout-approve-purchase', sanitized) : Promise.reject(new Error('NO_IPC_RENDERER'));
            } catch (err) {
                return Promise.reject(err);
            }
        },
        cancelCheckout: (request) => {
            try {
                const sanitized = sanitizeCancelRequest(request);
                return renderer ? renderer.invoke('checkout-cancel', sanitized) : Promise.reject(new Error('NO_IPC_RENDERER'));
            } catch (err) {
                return Promise.reject(err);
            }
        },
        getSafeReview: (request) => {
            try {
                if (!request || typeof request !== 'object') {
                    throw new Error('INVALID_REVIEW_REQUEST: Payload must be an object');
                }
                if (typeof request.sessionId !== 'string' || !request.sessionId.trim()) {
                    throw new Error('INVALID_REVIEW_REQUEST: sessionId must be a non-empty string');
                }
                return renderer ? renderer.invoke('checkout-get-safe-review', { sessionId: request.sessionId.trim() }) : Promise.reject(new Error('NO_IPC_RENDERER'));
            } catch (err) {
                return Promise.reject(err);
            }
        }
    };
}

if (contextBridge && ipcRenderer) {
    contextBridge.exposeInMainWorld("electronAPI", {
        sendBuddyCommand: (command) => ipcRenderer.send("buddy-command", command),
        closeApp: () => ipcRenderer.send("close-app"),
        onAgentApproval: (cb) => ipcRenderer.on("agent-approval", (_, data) => cb(_, data)),
        removeAgentApproval: (cb) => ipcRenderer.removeListener("agent-approval", cb),
        positionCenter: () => ipcRenderer.invoke('window-position-center'),
        positionHide: () => ipcRenderer.invoke('window-hide'),
        positionShow: () => ipcRenderer.invoke('window-show'),
        minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
        toggleMaximizeWindow: () => ipcRenderer.invoke('window-toggle-maximize'),
        isWindowMaximized: () => ipcRenderer.invoke('window-is-maximized'),
        onWindowMaximizeChange: (cb) => {
            const handler = (_, isMaximized) => {
                if (typeof cb === 'function') cb(isMaximized);
            };
            ipcRenderer.on('window-maximize-changed', handler);
            return () => ipcRenderer.removeListener('window-maximize-changed', handler);
        },
    });

    contextBridge.exposeInMainWorld("buddyAPI", {
        askBuddy: (prompt, history = []) => ipcRenderer.invoke("ask-buddy", prompt, history)
    });

    contextBridge.exposeInMainWorld("buddyAgent", createBuddyAgentBridge(ipcRenderer));

    contextBridge.exposeInMainWorld("buddySTT", {
        getResult: () => ipcRenderer.invoke("get-stt-result"),
        getStatus: () => ipcRenderer.invoke("get-stt-status"),
        notifyOpen: () => ipcRenderer.invoke("stt-app-open"),
        notifyClose: () => ipcRenderer.invoke("stt-app-close"),
    });

    contextBridge.exposeInMainWorld("api", {
        send: (channel, data) => ipcRenderer.send(channel, data),
        on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
        removeListener: (channel, func) => ipcRenderer.removeListener(channel, func)
    });
}

const preloadExports = {
    sanitizeApprovalRequest,
    sanitizeCancelRequest,
    createBuddyAgentBridge
};

if (typeof globalThis !== 'undefined') {
    globalThis.__buddyPreloadExports = preloadExports;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = preloadExports;
}