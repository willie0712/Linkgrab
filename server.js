const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');
if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');

function findYtDlpPath() {
    const paths = ['yt-dlp', path.join(process.cwd(), 'yt-dlp'), path.join(process.cwd(), 'yt-dlp.exe')];
    for (const p of paths) {
        try {
            const { execSync } = require('child_process');
            execSync(`"${p}" --version`, { timeout: 5000 });
            console.log(`✅ 找到 yt-dlp: ${p}`);
            return p;
        } catch(e) {}
    }
    return 'yt-dlp';
}

const ytDlpPath = findYtDlpPath();

async function runYtDlp(args) {
    const command = `"${ytDlpPath}" --no-check-certificate ${args}`;
    console.log(`執行: ${command.substring(0, 150)}...`);
    return await execPromise(command);
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// ========== 搜尋 API ==========
app.post('/api/search', async (req, res) => {
    const { query, platform, limit } = req.body;
    const searchLimit = limit || 10;
    
    let searchPrefix = '';
    if (platform === 'youtube') searchPrefix = `ytsearch${searchLimit}:`;
    else if (platform === 'soundcloud') searchPrefix = `scsearch${searchLimit}:`;
    else searchPrefix = `ytsearch${searchLimit}:`;
    
    const searchUrl = `${searchPrefix}${query}`;
    console.log(`搜尋: ${searchUrl}`);
    
    try {
        const { stdout } = await runYtDlp(`-j --flat-playlist --no-warnings "${searchUrl}"`);
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        const results = lines.map(line => {
            try {
                const info = JSON.parse(line);
                return {
                    title: info.title,
                    url: info.url,
                    duration: info.duration || 0,
                    uploader: info.uploader || '未知'
                };
            } catch (e) {
                return null;
            }
        }).filter(v => v !== null);
        
        res.json({ results });
    } catch (err) {
        console.error('搜尋錯誤:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== 影片資訊 API ==========
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });
    try {
        const { stdout } = await runYtDlp(`-j --no-warnings "${url}"`);
        const info = JSON.parse(stdout);
        res.json({ 
            type: 'video', 
            title: info.title || '影片',
            thumbnail: info.thumbnail || '',
            duration: info.duration || 0,
            uploader: info.uploader || '未知',
            view_count: info.view_count || 0,
            like_count: info.like_count || 0
        });
    } catch (err) {
        console.error('解析錯誤:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== 下載 API ==========
app.post('/api/download', async (req, res) => {
    const { url, quality, format, filename } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });

    try {
        const { stdout } = await runYtDlp(`--get-title --no-warnings "${url}"`);
        let title = stdout.trim().replace(/[<>:"/\\|?*]/g, '_');
        
        // 使用自訂檔名
        if (filename && filename.trim()) {
            title = filename.trim().replace(/[<>:"/\\|?*]/g, '_');
        }
        
        const tempDir = path.join(__dirname, 'temp', Date.now().toString());
        fs.mkdirSync(tempDir, { recursive: true });

        const outputTemplate = path.join(tempDir, `${title}.%(ext)s`);
        let finalFilename;

        if (format === 'mp3') {
            finalFilename = `${title}.mp3`;
            await runYtDlp(`-f bestaudio --extract-audio --audio-format mp3 --audio-quality 2 -o "${outputTemplate}" "${url}"`);
        } else {
            finalFilename = `${title}.mp4`;
            let formatCode;
            
            if (url.includes('instagram.com')) {
                formatCode = 'best[ext=mp4]/best';
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                if (quality === 'low') {
                    formatCode = 'bestvideo[height<=480][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=480][ext=mp4][vcodec^=avc1]';
                } else if (quality === 'medium') {
                    formatCode = 'bestvideo[height<=720][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=720][ext=mp4][vcodec^=avc1]';
                } else {
                    formatCode = 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]';
                }
            } else {
                formatCode = 'best[ext=mp4]/best';
            }
            
            await runYtDlp(`-f "${formatCode}" --merge-output-format mp4 -o "${outputTemplate}" "${url}"`);
        }

        const files = fs.readdirSync(tempDir);
        const downloadedFile = files.find(f => f.endsWith(format === 'mp3' ? '.mp3' : '.mp4'));
        if (!downloadedFile) throw new Error('下載失敗');

        const filePath = path.join(tempDir, downloadedFile);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(finalFilename)}`);
        res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        fileStream.on('end', () => {
            setTimeout(() => fs.rm(tempDir, { recursive: true, force: true }, () => {}), 5000);
        });
    } catch (err) {
        console.error('下載錯誤:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ LinkGrab 後端運行中: http://localhost:${PORT}`);
});
