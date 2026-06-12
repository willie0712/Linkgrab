const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// 確保 downloads 資料夾存在
const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// 靜態檔案 (前端 index.html)
app.use(express.static(path.join(__dirname, 'public')));

// 測試 API
app.get('/api/hello', (req, res) => {
  console.log("✅ /api/hello 被呼叫");
  res.json({ message: 'Server is running!' });
});

// 下載 API
app.get('/api/download', (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Missing URL' });
  }

  // 開發模式用 __dirname，打包後用 resourcesPath
  const exePath = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, 'yt-dlp.exe')
    : path.join(process.resourcesPath, 'yt-dlp.exe');

  const outputTemplate = path.join(downloadDir, '%(title)s.%(ext)s');

  console.log("🎬 正在下載:", videoUrl);

  execFile(exePath, [videoUrl, '-o', outputTemplate], (err, stdout, stderr) => {
    if (err) {
      console.error("❌ yt-dlp 執行失敗:", stderr);
      return res.status(500).json({ error: stderr });
    }
    console.log("✅ 下載完成:", stdout);
    res.json({ success: true, output: stdout });
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
