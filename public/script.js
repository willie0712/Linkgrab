const analyzeBtn = document.getElementById('analyzeBtn');
const urlInput = document.getElementById('urlInput');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const qualitySection = document.getElementById('qualitySection');
const downloadBtn = document.getElementById('downloadBtn');
const loadingDiv = document.getElementById('loading');
const errorMsg = document.getElementById('errorMsg');

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

async function analyzeUrl() {
    const url = urlInput.value.trim();
    if (!url) {
        showError('請輸入網址');
        return;
    }
    
    currentUrl = url;
    showLoading(true);
    step2.style.display = 'none';
    step3.style.display = 'none';
    
    try {
        const response = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        
        step2.style.display = 'flex';
        step3.style.display = 'block';
        
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

async function download() {
    if (!currentUrl) {
        showError('請先分析網址');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentUrl,
                quality: selectedQuality,
                format: selectedFormat
            })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || '下載失敗');
        }
        
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        
        let filename = selectedFormat === 'mp3' ? 'audio.mp3' : 'video.mp4';
        const contentDisposition = response.headers.get('Content-Disposition');
        if (contentDisposition) {
            const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
            if (match) filename = decodeURIComponent(match[1]);
        }
        
        a.download = filename;
        a.click();
        URL.revokeObjectURL(downloadUrl);
        
    } catch (err) {
        showError(err.message);
    } finally {
        showLoading(false);
    }
}

analyzeBtn.addEventListener('click', analyzeUrl);
downloadBtn.addEventListener('click', download);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') analyzeUrl();
});

document.querySelector('.format-card').classList.add('selected');
document.querySelector('.quality-card').classList.add('active');