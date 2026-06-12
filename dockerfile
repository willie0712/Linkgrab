FROM node:18-bullseye

# 更新系統並安裝 yt-dlp 和 ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 用 pip 安裝 yt-dlp（比 apt 版本更新）
RUN pip3 install yt-dlp --break-system-packages || pip3 install yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
