const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (cmd, ...args) => ipcRenderer.invoke(cmd, ...args),
  on: (channel, callback) => {
    const wrapped = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
