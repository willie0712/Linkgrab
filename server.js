async function findYtDlp() {
  const paths = ['yt-dlp', '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp'];
  for (const p of paths) {
    try {
      await execPromise(`"${p}" --version`);
      return p;
    } catch (e) {}
  }
  throw new Error('yt-dlp not found');
}

let ytDlpPath = null;

findYtDlp()
  .then(p => {
    ytDlpPath = p;
    console.log(`✅ yt-dlp: ${p}`);
  })
  .catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });

async function runYtDlp(args) {
  if (!ytDlpPath) throw new Error('yt-dlp 尚未初始化或不存在');
  const command = `${ytDlpPath} --no-check-certificate ${args}`;
  console.log(`執行: ${command.substring(0, 150)}...`);
  return await execPromise(command);
}
