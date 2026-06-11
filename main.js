const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');
const fs = require('fs');

let serverProcess = null;

function startBackend() {
    const scriptPath = path.join(process.cwd(), 'server.js');
    console.log(`啟動後端: ${scriptPath}`);
    
    if (!fs.existsSync(scriptPath)) {
        console.error('找不到 server.js');
        return;
    }
    
    serverProcess = fork(scriptPath, [], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production' }
    });
}

function waitForBackend() {
    return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 40;
        
        const check = () => {
            attempts++;
            const req = http.get('http://localhost:3000/api/health', (res) => {
                if (res.statusCode === 200) {
                    console.log('✅ 後端已就緒');
                    resolve();
                } else if (attempts < maxAttempts) {
                    setTimeout(check, 200);
                } else {
                    console.warn('⚠️ 後端啟動逾時');
                    resolve();
                }
            });
            req.on('error', () => {
                if (attempts < maxAttempts) {
                    setTimeout(check, 200);
                } else {
                    resolve();
                }
            });
            req.end();
        };
        
        check();
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'public', 'web.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    
    win.loadURL('http://localhost:3000');
    win.setMenuBarVisibility(false);
    
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
}

app.whenReady().then(async () => {
    startBackend();
    await waitForBackend();
    createWindow();
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});