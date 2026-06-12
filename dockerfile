FROM node:18

# 更新系統並安裝 yt-dlp 和 ffmpeg
RUN apt-get update && apt-get install -y \
    yt-dlp \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 複製 package.json 並安裝依賴
COPY package*.json ./
RUN npm install

# 複製所有程式碼
COPY . .

# 開放 3000 埠
EXPOSE 3000

# 啟動伺服器
CMD ["node", "server.js"]
