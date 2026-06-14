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

// ========== 影片/播放清單資訊 API ==========
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });
    
    try {
        // 檢查是否為播放清單
        const isPlaylist = url.includes('list=') || url.includes('playlist') || url.includes('&list=');
        
        if (isPlaylist) {
            console.log('📁 偵測到播放清單');
            // 獲取清單內所有影片
            const { stdout } = await runYtDlp(`-j --flat-playlist --no-warnings "${url}"`);
            const lines = stdout.trim().split('\n').filter(l => l.trim());
            const items = lines.map(line => {
                try {
                    const info = JSON.parse(line);
                    return {
                        id: info.id,
                        title: info.title,
                        duration: info.duration || 0,
                        url: `https://youtube.com/watch?v=${info.id}`
                    };
                } catch(e) { 
                    return null; 
                }
            }).filter(v => v !== null);
            
            // 獲取播放清單標題
            let playlistTitle = '播放清單';
            try {
                const titleCmd = await runYtDlp(`--get-title --no-warnings "${url}"`);
                playlistTitle = titleCmd.stdout.trim().replace(/[<>:"/\\|?*]/g, '_');
            } catch(e) {}
            
            return res.json({ 
                type: 'playlist', 
                title: playlistTitle,
                count: items.length,
                items: items 
            });
        } else {
            // 單一影片
            console.log('🎬 偵測到單一影片');
            const { stdout } = await runYtDlp(`-j --no-warnings "${url}"`);
            const info = JSON.parse(stdout);
            return res.json({ 
                type: 'video', 
                title: info.title || '影片',
                thumbnail: info.thumbnail || '',
                duration: info.duration || 0,
                uploader: info.uploader || '未知'
            });
        }
    } catch (err) {
        console.error('解析錯誤:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== 下載單一影片 ==========
app.post('/api/download', async (req, res) => {
    const { url, quality, format } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });

    try {
        const { stdout } = await runYtDlp(`--get-title --no-warnings "${url}"`);
        let title = stdout.trim().replace(/[<>:"/\\|?*]/g, '_');
        const tempDir = path.join(__dirname, 'temp', Date.now().toString());
        fs.mkdirSync(tempDir, { recursive: true });

        const outputTemplate = path.join(tempDir, `${title}.%(ext)s`);
        let filename;

        if (format === 'mp3') {
            filename = `${title}.mp3`;
            await runYtDlp(`-f bestaudio --extract-audio --audio-format mp3 --audio-quality 2 -o "${outputTemplate}" "${url}"`);
        } else {
            filename = `${title}.mp4`;
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
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
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

// ========== 下載播放清單（打包成 ZIP） ==========
app.post('/api/download-playlist', async (req, res) => {
    const { items, quality, format, playlistTitle } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: '請選擇要下載的項目' });
    
    const zipFileName = `${playlistTitle || 'playlist'}_${Date.now()}.zip`;
    const tempDir = path.join(__dirname, 'temp', Date.now().toString());
    const downloadDir = path.join(tempDir, 'downloads');
    fs.mkdirSync(downloadDir, { recursive: true });
    
    try {
        // 逐一處理每個影片
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            console.log(`📥 下載 ${i+1}/${items.length}: ${item.title}`);
            
            const outputTemplate = path.join(downloadDir, `${item.title}.%(ext)s`);
            
            if (format === 'mp3') {
                await runYtDlp(`-f bestaudio --extract-audio --audio-format mp3 --audio-quality 2 -o "${outputTemplate}" "${item.url}"`);
            } else {
                let formatCode;
                if (quality === 'low') {
                    formatCode = 'bestvideo[height<=480][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=480][ext=mp4][vcodec^=avc1]';
                } else if (quality === 'medium') {
                    formatCode = 'bestvideo[height<=720][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=720][ext=mp4][vcodec^=avc1]';
                } else {
                    formatCode = 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]';
                }
                await runYtDlp(`-f "${formatCode}" --merge-output-format mp4 -o "${outputTemplate}" "${item.url}"`);
            }
        }
        
        // 打包成 ZIP
        const archiver = require('archiver');
        const zipPath = path.join(tempDir, zipFileName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        archive.directory(downloadDir, false);
        await archive.finalize();
        
        output.on('close', () => {
            res.download(zipPath, zipFileName, () => {
                setTimeout(() => fs.rm(tempDir, { recursive: true, force: true }, () => {}), 5000);
            });
        });
        
    } catch (err) {
        console.error('播放清單下載錯誤:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`✅ LinkGrab 後端運行中: http://localhost:${PORT}`);
});