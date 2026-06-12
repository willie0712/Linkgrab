// 修改第 89 行，改名避免衝突
app.post('/api/download', async (req, res) => {
    const { url, quality, outputFormat } = req.body; // 改名為 outputFormat
    
    if (!url) return res.status(400).json({ error: '請提供網址' });

    try {
        // 檢查 yt-dlp 是否可用
        if (ytDlpPath === 'yt-dlp') {
            try {
                await execPromise('yt-dlp --version');
            } catch (e) {
                return res.status(500).json({ 
                    error: 'yt-dlp 未安裝，請執行: npm install -g yt-dlp' 
                });
            }
        }

        const { stdout } = await runYtDlp(`--get-title --no-warnings "${url}"`);
        let title = stdout.trim().replace(/[<>:"/\\|?*]/g, '_');
        
        // 防止空標題
        if (!title) title = `video_${Date.now()}`;
        
        const tempDir = path.join(__dirname, 'temp', Date.now().toString());
        fs.mkdirSync(tempDir, { recursive: true });

        const outputTemplate = path.join(tempDir, `${title}.%(ext)s`);
        let filename;
        let fileExt;

        if (outputFormat === 'mp3') {
            fileExt = 'mp3';
            filename = `${title}.mp3`;
            await runYtDlp(`-f bestaudio --extract-audio --audio-format mp3 -o "${outputTemplate}" "${url}"`);
        } else {
            fileExt = 'mp4';
            filename = `${title}.mp4`;
            
            // 設定品質參數預設值
            const videoQuality = quality || 'medium';
            let formatCode;
            
            if (url.includes('instagram.com')) {
                formatCode = 'best[ext=mp4]/best';
            } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                if (videoQuality === 'low') {
                    formatCode = 'bestvideo[height<=480][ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[height<=480][ext=mp4][vcodec^=avc1]';
                } else if (videoQuality === 'medium') {
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
        const downloadedFile = files.find(f => f.endsWith(`.${fileExt}`));
        
        if (!downloadedFile) {
            throw new Error(`下載失敗：找不到 .${fileExt} 檔案`);
        }

        const filePath = path.join(tempDir, downloadedFile);
        
        // 檢查檔案是否存在且可讀
        if (!fs.existsSync(filePath)) {
            throw new Error('下載的檔案不存在');
        }
        
        const stat = fs.statSync(filePath);
        if (stat.size === 0) {
            throw new Error('下載的檔案為空');
        }

        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('Content-Type', outputFormat === 'mp3' ? 'audio/mpeg' : 'video/mp4');
        res.setHeader('Content-Length', stat.size);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('error', (err) => {
            console.error('檔案傳輸錯誤:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: '檔案傳輸失敗' });
            }
        });
        
        fileStream.on('end', () => {
            setTimeout(() => {
                fs.rm(tempDir, { recursive: true, force: true }, (err) => {
                    if (err) console.error('清理臨時檔案失敗:', err);
                });
            }, 5000);
        });
    } catch (err) {
        console.error('下載錯誤:', err);
        res.status(500).json({ 
            error: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});
