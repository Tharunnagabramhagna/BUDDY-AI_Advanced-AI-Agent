const { contextBridge, ipcRenderer } = require("electron")
console.log("Buddy preload bridge loaded")

contextBridge.exposeInMainWorld("electronAPI", {
    sendBuddyCommand: (command) => ipcRenderer.send("buddy-command", command),
    closeApp: () => ipcRenderer.send("close-app"),
    onAgentApproval: (cb) => ipcRenderer.on("agent-approval", (_, data) => cb(_, data)),
    removeAgentApproval: (cb) => ipcRenderer.removeListener("agent-approval", cb),
    positionCenter: () => ipcRenderer.invoke('window-position-center'),
    positionHide: () => ipcRenderer.invoke('window-hide'),
    positionShow: () => ipcRenderer.invoke('window-show'),
})

contextBridge.exposeInMainWorld("buddyAPI", {
    askBuddy: (prompt, history = []) => ipcRenderer.invoke("ask-buddy", prompt, history)
})

contextBridge.exposeInMainWorld("buddyAgent", {
    execute: (action) => ipcRenderer.invoke('execute-agent', action),
    checkoutStep: (action) => ipcRenderer.invoke('agent-checkout-step', action),
})

contextBridge.exposeInMainWorld("buddySTT", {
    getResult: () => ipcRenderer.invoke("get-stt-result"),
    getStatus: () => ipcRenderer.invoke("get-stt-status"),
    notifyOpen: () => ipcRenderer.invoke("stt-app-open"),
    notifyClose: () => ipcRenderer.invoke("stt-app-close"),
})

contextBridge.exposeInMainWorld("api", {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
    removeListener: (channel, func) => ipcRenderer.removeListener(channel, func)
})