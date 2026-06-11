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

app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });
    try {
        const { stdout } = await runYtDlp(`-j --no-warnings "${url}"`);
        const info = JSON.parse(stdout);
        res.json({ type: 'video', title: info.title || '影片' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/download', async (req, res) => {
    const { url, quality, format } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });

    console.log(`📍 下載: ${url}`);

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

            // Instagram：一定不能用固定ID，要讓 yt-dlp 自動選
            if (url.includes('instagram.com')) {
                // 直接抓最佳品質，讓 yt-dlp 自己決定用哪個格式
                formatCode = 'best[ext=mp4]';
                console.log('🎬 Instagram 使用自動選擇格式');
            }
            // YouTube：強制 H.264
            else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                if (quality === 'low') {
                    formatCode = 'bestvideo[height<=480][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=480][ext=mp4][vcodec^=avc1]';
                } else if (quality === 'medium') {
                    formatCode = 'bestvideo[height<=720][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=720][ext=mp4][vcodec^=avc1]';
                } else {
                    formatCode = 'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]';
                }
            }
            // 其他平台
            else {
                formatCode = 'best[ext=mp4]';
            }

            console.log(`📹 格式代碼: ${formatCode}`);
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

app.listen(PORT, () => {
    console.log(`✅ LinkGrab 後端運行中: http://localhost:${PORT}`);
});