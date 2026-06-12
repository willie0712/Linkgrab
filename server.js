const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 建立必要的資料夾
if (!fs.existsSync('./downloads')) fs.mkdirSync('./downloads');

// 尋找 yt-dlp 路徑
async function findYtDlp() {
    const paths = [
        'yt-dlp',
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        '/app/.local/bin/yt-dlp', // Docker 或雲端環境
        'C:\\Python39\\Scripts\\yt-dlp.exe', // Windows
    ];
    for (const p of paths) {
        try {
            await execPromise(`"${p}" --version`);
            console.log(`✅ 找到 yt-dlp: ${p}`);
            return p;
        } catch (e) {
            // 繼續尋找下一個路徑
        }
    }
    throw new Error(
        '❌ 未找到 yt-dlp，請執行 `pip install yt-dlp` 並確認路徑已加入 PATH。' +
        '\nLinux/macOS: `pip3 install yt-dlp`' +
        '\nWindows: `pip install yt-dlp` 或 `py -m pip install yt-dlp`'
    );
}

// 全域變數：yt-dlp 路徑
let ytDlpPath;
findYtDlp()
    .then((p) => {
        ytDlpPath = p;
        console.log(`✅ yt-dlp 路徑: ${p}`);
    })
    .catch((err) => {
        console.error(err.message);
        process.exit(1); // 如果找不到 yt-dlp，直接退出程式
    });

// 執行 yt-dlp 命令
async function runYtDlp(args) {
    const command = `${ytDlpPath} --no-check-certificate ${args}`;
    console.log(`執行命令: ${command.substring(0, 150)}...`);
    try {
        const { stdout, stderr } = await execPromise(command);
        if (stderr) console.error(`yt-dlp 錯誤: ${stderr}`);
        return stdout;
    } catch (err) {
        console.error(`執行 yt-dlp 失敗: ${err.message}`);
        throw new Error(`yt-dlp 命令失敗: ${err.message}`);
    }
}

// 健康檢查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// 獲取影片資訊
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });

    try {
        const stdout = await runYtDlp(`-j --no-warnings "${url}"`);
        const info = JSON.parse(stdout);
        res.json({
            type: 'video',
            title: info.title || '影片',
            thumbnail: info.thumbnail || '',
            duration: info.duration || 0,
            uploader: info.uploader || '未知',
            view_count: info.view_count || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 下載影片或音頻
app.post('/api/download', async (req, res) => {
    const { url, format = 'mp4', quality = 'high' } = req.body;
    if (!url) return res.status(400).json({ error: '請提供網址' });

    const tempDir = path.join(__dirname, 'temp', Date.now().toString());
    fs.mkdirSync(tempDir, { recursive: true });
    const outputTemplate = path.join(tempDir, '%(title)s.%(ext)s');

    try {
        let title = '下載檔案';
        let filename;
        let formatCode;

        // 先獲取影片資訊
        const info = JSON.parse(await runYtDlp(`-j --no-warnings "${url}"`));
        title = info.title || '下載檔案';

        if (format === 'mp3') {
            filename = `${title}.mp3`;
            await runYtDlp(`-x --audio-format mp3 -o "${outputTemplate}" "${url}"`);
        } else {
            filename = `${title}.mp4`;
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
            await runYtDlp(`-f "${formatCode}" --merge-output-format mp4 -o "${outputTemplate}" "\${url
