const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let serverProcess = null;

function startBackend() {
    return new Promise((resolve) => {
        const serverPath = path.join(process.cwd(), 'server.js');
        console.log('啟動後端:', serverPath);
        
        serverProcess = spawn('node', [serverPath], {
            cwd: process.cwd(),
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: 'pipe'
        });
        
        serverProcess.stdout.on('data', (data) => {
            console.log(`[後端] ${data}`);
            if (data.includes('運行中')) resolve();
        });
        
        setTimeout(() => resolve(), 3000);
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
    await startBackend();
    createWindow();
});

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});