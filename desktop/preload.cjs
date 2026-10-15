// Exposes only the setup actions to the key setup window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopSetup", {
  get: () => ipcRenderer.invoke("setup:get"),
  save: (values) => ipcRenderer.invoke("setup:save", values),
  openExternal: (url) => ipcRenderer.invoke("setup:open-external", url),
});
