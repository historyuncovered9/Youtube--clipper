const express = require("express");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const OUTPUT_DIR = path.join(__dirname, "clips");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

function toSeconds(t) {
  if (!t) return 0;
  if (!isNaN(t)) return Number(t);
  const parts = t.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

app.post("/api/clip", async (req, res) => {
  const { url, start, end } = req.body;
  if (!url || start === undefined || end === undefined) {
    return res.status(400).json({ error: "url, start aur end zaroori hain" });
  }
  const startSec = toSeconds(start);
  const endSec = toSeconds(end);
  if (endSec <= startSec) {
    return res.status(400).json({ error: "End time, start time se bada hona chahiye" });
  }
  if (endSec - startSec > 120) {
    return res.status(400).json({ error: "Clip zyada se zyada 2 minute ka ho sakta hai" });
  }
  const id = uuidv4();
  const rawFile = path.join(OUTPUT_DIR, `${id}_raw.mp4`);
  const outFile = path.join(OUTPUT_DIR, `${id}.mp4`);
  const downloadCmd = `yt-dlp ---extractor-args "youtube:player_client=android" -f "bv*[height<=720]+ba/b[height<=720]" --download-sections "*${startSec}-${endSec}" -o "${rawFile}" "${url}"`;
  exec(downloadCmd, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error(stderr);
      return res.status(500).json({ error: "Video download nahi ho paaya. Link check karo." });
    }
    const ffmpegCmd = `ffmpeg -y -i "${rawFile}" -c copy "${outFile}"`;
    exec(ffmpegCmd, { timeout: 60000 }, (ffErr) => {
      fs.existsSync(rawFile) && fs.unlinkSync(rawFile);
      if (ffErr || !fs.existsSync(outFile)) {
        console.error(ffErr);
        return res.status(500).json({ error: "Clip banane mein error aaya." });
      }
      res.json({ downloadUrl: `/clips/${id}.mp4` });
    });
  });
});

app.use("/clips", express.static(OUTPUT_DIR));

setInterval(() => {
  fs.readdir(OUTPUT_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    files.forEach((file) => {
      const filePath = path.join(OUTPUT_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (now - stats.mtimeMs > 30 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, 10 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Server chal raha hai port ${PORT} par`);
});
