const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'public', 'index.html'));
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  console.log("🚀 正在啟動 server.js...");
  serverProcess = fork(path.join(__dirname, 'server.js'));

  serverProcess.on('error', (err) => {
    console.error("❌ server.js 啟動失敗:", err);
  });

  serverProcess.on('exit', (code) => {
    console.log("ℹ️ server.js 已退出，代碼:", code);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) serverProcess.kill();
});
