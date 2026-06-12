const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 正式載入本機 Express 服務網址，確保 fetch 路由完全對齊
  win.loadURL('http://localhost:3000');
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// 輪詢檢測：確保 Express 已經把 Port 3000 綁定成功後才開視窗
function waitForServer() {
  const req = http.request({ host: 'localhost', port: 3000, path: '/api/hello', method: 'GET' }, (res) => {
    // 成功收到回應，代表後端已完全就緒
    createWindow();
  });

  req.on('error', () => {
    // 失敗則隔 100ms 後重試
    setTimeout(waitForServer, 100);
  });

  req.end();
}

app.whenReady().then(() => {
  // 在 Electron 主程序內啟動 Express，避免打包後 fork 重新開啟 Electron 視窗程序
  require(path.join(__dirname, 'server.js'));
  
  // 開始偵測後端狀態
  waitForServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  // Express 會跟著 Electron 主程序一起結束
});
