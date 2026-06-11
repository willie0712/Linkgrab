# 🔗 LinkGrab

**LinkGrab** 是一個免費、乾淨、無廣告的多平台影片下載器。

支援 YouTube、Facebook、TikTok、Instagram、SoundCloud、Twitter、Vimeo。

---

## ✨ 特色

- 🎬 支援多平台：YouTube、Facebook、TikTok、Instagram、SoundCloud、Twitter、Vimeo
- 🎵 下載影片 MP4 / 音樂 MP3
- 📱 手機響應式介面
- 🔓 100% 乾淨、無廣告
- 📖 開源免費
- 🛡️ 純本機執行，無需上傳

---

## 📥 下載安裝

[下載 LinkGrab Setup 1.0.0.exe]
請見release裡面！

### 安裝步驟

1. 雙擊 `LinkGrab Setup 1.0.0.exe`
2. 按步驟完成安裝
3. 桌面出現 **LinkGrab** 圖示
4. 雙擊圖示開啟
5. 貼上連結 → 選擇格式 → 下載

---

## 🚀 使用方式

1. 貼上影片或音樂連結
2. 點擊「分析」
3. 選擇格式（MP4 影片 / MP3 音樂）
4. 選擇畫質（高 / 中 / 低）
5. 點擊「下載」

---

## 📋 支援平台
| 平台 | 狀態 |
|------|------|
| ▶️ YouTube | ✅ H.264 MP4 |✅MP3
| 📘 Facebook | ✅ 可下載 |❌MP3
| 📱 TikTok | ✅ 可下載 |❌MP3
| 📷 Instagram | ✅ 可下載 |❌MP3
| 🎧 SoundCloud | ✅ MP3 |❌MP4 
| 🐦 Twitter | ✅ MP4可下載 |❌MP3
| 🎬 Vimeo | ✅ MP4可下載 |✅MP3


## 🛠️ 開發者資訊

### 技術架構

- Electron (PC 版介面)
- Node.js + Express (後端服務)
- yt-dlp (下載核心)
- FFmpeg (影音處理)

### 從原始碼建置

```bash
git clone https://github.com/你的帳號/LinkGrab.git
cd LinkGrab
npm install
npm run build
