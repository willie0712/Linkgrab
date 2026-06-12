FROM node:18

# 安裝 Python 和 pip
RUN apt-get update && apt-get install -y python3 python3-pip

# 安裝 yt-dlp
RUN pip install yt-dlp

# 設定工作目錄
WORKDIR /app

# 複製專案檔案
COPY package*.json ./
COPY . .

# 安裝 Node.js 相依性
RUN npm install

# 曝露埠號
EXPOSE 3000

# 啟動伺服器
CMD ["node", "server.js"]
