// 引入 Electron 的 IPC 通訊模組
const { ipcRenderer } = require('electron');

const analyzeBtn = document.getElementById('analyzeBtn');
const urlInput = document.getElementById('urlInput');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const qualitySection = document.getElementById('qualitySection');
const downloadBtn = document.getElementById('downloadBtn');
const loadingDiv = document.getElementById('loading');
const errorMsg = document.getElementById('errorMsg');
const downloadLink = document.getElementById('downloadLink');

let selectedFormat = 'mp4';
let selectedQuality = 'high';
let currentUrl = '';

document.querySelectorAll('.format-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedFormat = card.dataset.format;
        qualitySection.style.display = selectedFormat === 'mp3' ? 'none' : 'block';
    });
});

document.querySelectorAll('.quality-card').forEach(card => {
    card.addEventListener('click', () => {
        document.querySelectorAll('.quality-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedQuality = card.dataset.quality;
    });
});

function showError(msg) {
    errorMsg.textContent = `❌ ${msg}`;
    errorMsg.style.display = 'block';
    setTimeout(() => errorMsg.style.display = 'none', 5000);
}

function showLoading(show) {
    loadingDiv.style.display = show ? 'block' : 'none';
}

// 分析網址 (改用 ipcRenderer)
async function analyzeUrl() {
    const url = urlInput.value.trim();
    if (!url) {
        showError('請輸入網址');
        return;
    }

    showLoading(true);
    try {
        // 直接向主程序發送 IPC 請求
        const data = await ipcRenderer.invoke('analyze-url', url);
        currentUrl = url;
        
        document.getElementById('videoTitle').textContent = data.title;
        document.getElementById('videoThumbnail').src = data.thumbnail;
        
        step2.style.display = 'block';
        step3.style.display = 'block';
        
    } catch (err) {
        showError(err);
    } finally {
        showLoading(false);
    }
}

// 執行下載 (改用 ipcRenderer)
async function download() {
    if (!currentUrl) return;
    showLoading(true);
    try {
        // 向主程序請求下載並接收 Base64 資料
        const result = await ipcRenderer.invoke('download-file', {
            url: currentUrl,
            quality: selectedQuality,
            format: selectedFormat
        });
        
        // 將 Base64 還原為前端瀏覽器可下載的 Blob
        const byteCharacters = atob(result.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/octet-stream' });
        
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(downloadUrl);
        
    } catch (err) {
        showError(err);
    } finally {
        showLoading(false);
    }
}

analyzeBtn.addEventListener('click', analyzeUrl);
downloadBtn.addEventListener('click', download);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeUrl();
});

if (downloadLink) {
    downloadLink.textContent = '💻 電腦版下載';
}
