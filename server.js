const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const app = express();
const port = 3000;

app.use(express.json());

// 甇?Ⅱ閮恣 public 鞈?憭橘?霈?index.html ?霈?撠楝敺? style.css / script.js
app.use(express.static(path.join(__dirname, 'public')));

function getWritableBasePath() {
  return process.resourcesPath
    ? path.dirname(process.execPath)
    : __dirname;
}

function cleanBaseName(name) {
  return String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\.[0-9]+$/g, '')
    .replace(/\.+$/g, '')
    .slice(0, 120);
}

const downloadDir = path.join(getWritableBasePath(), 'downloads');
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// ?芸??斗??啣??楊霅舀??憓???yt-dlp.exe 撖阡?頝臬?
function getExePath() {
  const isPackaged = process.resourcesPath && !process.cwd().includes('node_modules');
  return isPackaged 
    ? path.join(process.resourcesPath, 'yt-dlp.exe') 
    : path.join(__dirname, 'yt-dlp.exe');
}

function getFfmpegPath() {
  const isPackaged = process.resourcesPath && !process.cwd().includes('node_modules');
  return isPackaged
    ? path.join(path.dirname(process.execPath), 'ffmpeg.exe')
    : path.join(__dirname, 'ffmpeg.exe');
}

function createVideoThumbnail(videoPath, thumbPath) {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    execFile(ffmpegPath, ['-y', '-ss', '00:00:01', '-i', videoPath, '-vframes', '1', '-q:v', '2', thumbPath], (err) => {
      if (err) {
        console.error('撱箇?蝮桀?憭望?:', err);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

function hasVideoStream(filePath) {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    execFile(ffmpegPath, ['-i', filePath], (err, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`;
      resolve(/Stream #\d+:\d+.*Video:/i.test(output));
    });
  });
}

function getMediaInfo(filePath) {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    execFile(ffmpegPath, ['-i', filePath], (err, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`;
      const lines = output.split(/\r?\n/);
      const videoLine = lines.find(line => /Stream #\d+:\d+.*Video:/i.test(line)) || '';
      const audioLine = lines.find(line => /Stream #\d+:\d+.*Audio:/i.test(line)) || '';
      resolve({
        hasVideo: Boolean(videoLine),
        hasAudio: Boolean(audioLine),
        videoCodec: (videoLine.match(/Video:\s*([^,\s]+)/i) || [])[1] || '',
        audioCodec: (audioLine.match(/Audio:\s*([^,\s]+)/i) || [])[1] || ''
      });
    });
  });
}

function transcodeToCompatibleMp4(inputPath, outputPath) {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    const args = [
      '-y',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) {
        console.error('Transcode compatible MP4 failed:', err);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

function getThumbnailUrl(sourceUrl) {
  return new Promise((resolve) => {
    const exePath = getExePath();
    execFile(exePath, ['-J', sourceUrl], (err, stdout) => {
      if (err) return resolve('');
      try {
        const data = JSON.parse(stdout);
        const bestThumbnail = Array.isArray(data.thumbnails) && data.thumbnails.length
          ? [...data.thumbnails]
              .filter(item => item && item.url)
              .sort((a, b) => {
                const areaA = (a.width || 0) * (a.height || 0);
                const areaB = (b.width || 0) * (b.height || 0);
                return areaB - areaA;
              })[0]
          : null;
        resolve(data.thumbnail || bestThumbnail?.url || '');
      } catch (e) {
        resolve('');
      }
    });
  });
}

function buildPosterVideo(imagePath, audioPath, outputPath) {
  return new Promise((resolve) => {
    const ffmpegPath = getFfmpegPath();
    const args = [
      '-y',
      '-loop', '1',
      '-i', imagePath,
      '-i', audioPath,
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-c:a', 'copy',
      '-shortest',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];
    execFile(ffmpegPath, args, (err) => {
      if (err) {
        console.error('撱箇???Ｗ蔣?仃??', err);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

// ????ａ?嚗? main.js 頛芾岷瑼Ｘ嚗?
app.get('/api/hello', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/thumbnail', (req, res) => {
  const rawUrl = String(req.query.url || '');
  if (!/^https?:\/\//i.test(rawUrl)) {
    return res.status(400).send('Invalid thumbnail URL');
  }

  const client = rawUrl.startsWith('https:') ? https : http;
  const request = client.get(rawUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.instagram.com/'
    }
  }, (upstream) => {
    if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
      res.redirect(`/api/thumbnail?url=${encodeURIComponent(new URL(upstream.headers.location, rawUrl).toString())}`);
      upstream.resume();
      return;
    }

    if (upstream.statusCode !== 200) {
      upstream.resume();
      return res.status(upstream.statusCode || 502).send('Thumbnail unavailable');
    }

    res.setHeader('Content-Type', upstream.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  });

  request.on('error', () => {
    if (!res.headersSent) res.status(502).send('Thumbnail unavailable');
  });
});

// ?? API嚗蝙??yt-dlp ??撠?瘜?敺?YouTube / SoundCloud 蝯?
app.post('/api/search', (req, res) => {
  const { query, platform = 'youtube', limit = 10 } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: '隢撓?交?撠??萄?' });
  }

  const exePath = getExePath();
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20);
  const searchPrefix = platform === 'soundcloud' ? 'scsearch' : 'ytsearch';
  const searchUrl = `${searchPrefix}${safeLimit}:${query.trim()}`;

  execFile(exePath, ['--dump-single-json', '--flat-playlist', searchUrl], (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        error: stderr ? stderr.trim() : '??憭望?嚗?蝔??岫'
      });
    }

    try {
      const data = JSON.parse(stdout);
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const results = entries
        .filter(item => item && (item.url || item.webpage_url || item.id))
        .map(item => {
          const itemUrl = item.webpage_url || item.url || '';
          const isFullUrl = /^https?:\/\//i.test(itemUrl);
          const url = isFullUrl
            ? itemUrl
            : platform === 'soundcloud'
              ? itemUrl
              : `https://www.youtube.com/watch?v=${item.id || itemUrl}`;

          return {
            title: item.title || 'Untitled',
            url,
            uploader: item.uploader || item.channel || item.creator || '',
            duration: item.duration || 0
          };
        });

      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: '閫????蝯?憭望?' });
    }
  });
});

// 1. 敶梁?鞈??? API (撠??垢 POST /api/info)
app.post('/api/info', (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '隢撓?亦雯?' });

  const exePath = getExePath();

  // 雿輻 -J ?頛詨 JSON ?澆????游蔣??閮?
  execFile(exePath, ['-J', url], (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: '??憭望?嚗?蝣箄?蝬脣??臬甇?Ⅱ銝血??舀' });
    }
    try {
      const data = JSON.parse(stdout);
      const bestThumbnail = Array.isArray(data.thumbnails) && data.thumbnails.length
        ? [...data.thumbnails]
            .filter(item => item && item.url)
            .sort((a, b) => {
              const areaA = (a.width || 0) * (a.height || 0);
              const areaB = (b.width || 0) * (b.height || 0);
              return areaB - areaA;
            })[0]
        : null;

      const thumbnail = data.thumbnail || bestThumbnail?.url || '';

      res.json({
        title: data.title || 'Untitled',
        thumbnail: thumbnail ? `/api/thumbnail?url=${encodeURIComponent(thumbnail)}` : '',
        uploader: data.uploader || data.channel || data.creator || '',
        view_count: data.view_count || 0,
        like_count: data.like_count || 0,
        duration: data.duration || 0
      });
    } catch (e) {
      res.status(500).json({ error: '閫??敶梁? JSON 鞈?憭望?' });
    }
  });
});

// 2. 瑼?銝? API (撠??垢 POST /api/download)
app.post('/api/download', (req, res) => {
  const { url, quality, format, filename } = req.body;
  if (!url) return res.status(400).json({ error: '蝻箏?敶梁?蝬脣?' });

  const exePath = getExePath();
  const ffmpegPath = getFfmpegPath();
  let args = [url, '--ffmpeg-location', ffmpegPath];
  const targetExt = format === 'mp3' ? 'mp3' : 'mp4';
  
  if (format === 'mp3') {
    args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    const heightLimit = quality === 'medium' ? '[height<=720]' : quality === 'low' ? '[height<=480]' : '';
    const qualityFilter = [
      'bestvideo' + heightLimit + '[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]',
      'bestvideo' + heightLimit + '[vcodec^=avc1]+bestaudio',
      'best' + heightLimit + '[ext=mp4][vcodec^=avc1]',
      'bestvideo' + heightLimit + '[ext=mp4]+bestaudio[ext=m4a]',
      'bestvideo' + heightLimit + '+bestaudio',
      'best' + heightLimit + '[vcodec!=none]',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]',
      'bestvideo+bestaudio',
      'best[vcodec!=none]'
    ].join('/');
    args.push('-f', qualityFilter, '--merge-output-format', 'mp4', '--recode-video', 'mp4', '--postprocessor-args', 'ffmpeg:-c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart');
  }

  // 雿輻???唾????臭??摮????踹?憭犖憭極??獢???  const tempId = `dl_${Date.now()}`;
  const safeFilename = cleanBaseName(filename);
  const outputBase = safeFilename || tempId;
  const finalFileName = `${outputBase}.${targetExt}`;
  const outputTemplate = path.join(downloadDir, `${outputBase}.%(ext)s`);
  args.push('-o', outputTemplate);

  execFile(exePath, args, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: '銝???憭望?: ' + stderr });
    }

    // ?? downloads 鞈?憭暹??箄府銝?銴?擐?撖阡?瑼?
    const files = fs.readdirSync(downloadDir);
    const targetFile =
      files.find(f => f === finalFileName) ||
      files.find(f => f.startsWith(outputBase) && (f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.webm') || f.endsWith('.m4a')));

    if (!targetFile) {
      return res.status(500).json({ error: '下載完成但找不到輸出檔案。' });
    }

    const filePath = path.join(downloadDir, targetFile);
    const siblingFiles = files.filter(f => f !== targetFile && f.startsWith(outputBase));
    let serveName = targetFile;

    if (targetFile !== finalFileName) {
      try {
        const finalPath = path.join(downloadDir, finalFileName);
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        fs.renameSync(filePath, finalPath);
        serveName = finalFileName;
      } catch (e) {
        console.error('?渡?瑼?憭望?:', e);
      }
    }

    const finalPath = path.join(downloadDir, serveName);
    const thumbPath = path.join(downloadDir, `${path.parse(serveName).name}.jpg`);

    // 閮剖? Headers ?迄?垢?銝??銝????脖??辣嚗蒂?舀 UTF-8 蝺函Ⅳ?葉????    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(serveName)}`);

    const sendFile = async () => {
      if (serveName.endsWith('.mp4')) {
        let mediaInfo = await getMediaInfo(finalPath);
        if (!mediaInfo.hasVideo) {
          return res.status(500).json({ error: '這個來源只抓到音訊，沒有影片畫面。請改用 MP3 或換一個影片連結。' });
        }

        mediaInfo = await getMediaInfo(finalPath);
        if (!mediaInfo.hasVideo) {
          return res.status(500).json({ error: '這個來源沒有抓到影片畫面，請改用 MP3 或換一個影片連結。' });
        }

        if (!/^h264$/i.test(mediaInfo.videoCodec) || (mediaInfo.audioCodec && !/^aac$/i.test(mediaInfo.audioCodec))) {
          const compatiblePath = path.join(downloadDir, `${path.parse(serveName).name}.compatible.mp4`);
          const converted = await transcodeToCompatibleMp4(finalPath, compatiblePath);
          if (converted && fs.existsSync(compatiblePath)) {
            fs.unlinkSync(finalPath);
            fs.renameSync(compatiblePath, finalPath);
          }
        }

        await createVideoThumbnail(finalPath, thumbPath);
      }

      // 撠?獢蝯血?蝡?Blob ?交嚗活靽?隡箸??冽摮?嚗?雿輻???賢 downloads ??Ｗ
      res.download(finalPath, serveName, (downloadErr) => {
        if (downloadErr) {
          console.error('銝??喲仃??', downloadErr);
          return;
        }

        for (const sibling of siblingFiles) {
          try {
            const siblingPath = path.join(downloadDir, sibling);
            if (fs.existsSync(siblingPath)) fs.unlinkSync(siblingPath);
          } catch (e) {
            console.error('皜???瑼仃??', e);
          }
        }
      });
    };

    sendFile().catch((e) => {
      console.error('皞?銝?憭望?:', e);
      res.status(500).json({ error: '皞?銝?憭望?' });
    });
  });
});

// API ?脣?嚗?摮??API 銝敺???JSON嚗??蝡舀? HTML ??JSON 閫??
app.use('/api', (req, res) => {
  res.status(404).json({ error: '?曆???API 頝舐' });
});

// ?祉?脣?嚗? API 隢?銝敺?擐?
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Express server backend listening on http://localhost:${port}`);
});


