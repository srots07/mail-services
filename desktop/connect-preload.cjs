// Exposes only the connect-account progress to the Connect window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopConnect", {
  onState: (cb) => ipcRenderer.on("connect:state", (_event, state) => cb(state)),
  openUrl: (url) => ipcRenderer.invoke("connect:open-url", url),
});
