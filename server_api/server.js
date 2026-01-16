const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { exec } = require("child_process");
const puppeteer = require("puppeteer");
const { v4: uuidv4 } = require("uuid");

const app = express();
// Allow any file extension, we will detect type manually
const upload = multer({ dest: "uploads/" });

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Sticker Converter API is running" });
});

// WhatsApp Limits
const MAX_SIZE_PX = 512;
const FPS = 20; // Reduced from 30 to save size

// Helper: Recursive delete to clean up temp files
const deleteFolderRecursive = (directoryPath) => {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
};

/**
 * POST /convert
 * Accepts multipart/form-data with a file field named 'sticker'
 */
app.post("/convert", upload.single("sticker"), async (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded.");

  const jobId = uuidv4();
  const tempDir = path.join(__dirname, "temp", jobId);
  const framesDir = path.join(tempDir, "frames");
  const outputWebP = path.join(tempDir, "output.webp");

  // Create temp directory for this specific job
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    console.log(
      `[${jobId}] Processing started. File type: ${req.file.mimetype}`
    );

    // --- TYPE DETECTION ---
    // Check mimetype or extension to determine if it's WebM or TGS
    const isWebM =
      req.file.mimetype.includes("video") ||
      req.file.originalname.toLowerCase().endsWith(".webm");

    let ffmpegInput = "";
    let ffmpegInputOptions = "";

    if (isWebM) {
      // === PATH A: WEBM VIDEO PROCESSING ===
      console.log(`[${jobId}] Detected WebM video. Bypassing Puppeteer.`);
      ffmpegInput = `"${req.file.path}"`;

      // Note: We don't need to extract frames. We feed the video directly to ffmpeg.
    } else {
      // === PATH B: TGS/LOTTIE ANIMATION PROCESSING ===
      console.log(`[${jobId}] Detected TGS/Lottie. Starting Puppeteer.`);

      if (!fs.existsSync(framesDir))
        fs.mkdirSync(framesDir, { recursive: true });

      // 1. Read and Decompress TGS (Gzip) -> Lottie JSON
      const tgsBuffer = fs.readFileSync(req.file.path);
      let lottieData;
      try {
        lottieData = zlib.gunzipSync(tgsBuffer).toString("utf-8");
      } catch (err) {
        lottieData = tgsBuffer.toString("utf-8"); // Fallback for raw JSON
      }

      // 2. Launch Puppeteer
      const browser = await puppeteer.launch({
        executablePath:
          process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        headless: "new",
      });

      const page = await browser.newPage();
      await page.setViewport({ width: MAX_SIZE_PX, height: MAX_SIZE_PX });

      // 3. Inject Lottie-Web
      const lottieLibPath = require.resolve(
        "lottie-web/build/player/lottie.min.js"
      );
      const lottieLib = fs.readFileSync(lottieLibPath, "utf8");

      const htmlContent = `
                <html>
                <style>
                    body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
                    #lottie { width: ${MAX_SIZE_PX}px; height: ${MAX_SIZE_PX}px; }
                </style>
                <body>
                    <div id="lottie"></div>
                    <script>
                        ${lottieLib}
                        const animationData = ${lottieData};
                        const anim = lottie.loadAnimation({
                            container: document.getElementById('lottie'),
                            renderer: 'svg',
                            loop: false,
                            autoplay: false,
                            animationData: animationData
                        });
                        window.seekToFrame = (frame) => { anim.goToAndStop(frame, true); };
                        window.getTotalFrames = () => anim.totalFrames;
                    </script>
                </body>
                </html>
            `;

      await page.setContent(htmlContent);

      // 4. Capture Frames
      const totalFrames = await page.evaluate(() => window.getTotalFrames());
      const frameLimit = Math.min(totalFrames, FPS * 3); // Cap at 3 seconds

      for (let i = 0; i < frameLimit; i++) {
        await page.evaluate((frame) => window.seekToFrame(frame), i);
        const fileName = `frame_${String(i).padStart(3, "0")}.png`;
        await page.screenshot({
          path: path.join(framesDir, fileName),
          omitBackground: true,
        });
      }
      await browser.close();

      // Set input for FFmpeg to the extracted frames
      ffmpegInput = `"${framesDir}/frame_%03d.png"`;
      ffmpegInputOptions = `-framerate ${FPS}`;
    }

    // === COMMON STEP: FFMPEG ENCODING ===
    console.log(`[${jobId}] Encoding WebP...`);

    const runFfmpeg = (params) => {
      return new Promise((resolve, reject) => {
        const cmd = `ffmpeg ${ffmpegInputOptions} -y -i ${ffmpegInput} -t 10 -vf "fps=${FPS},scale=${MAX_SIZE_PX}:${MAX_SIZE_PX}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${MAX_SIZE_PX}:${MAX_SIZE_PX}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -c:v libwebp -lossless 0 -preset default -loop 0 -an -vsync 0 ${params} "${outputWebP}"`;
        exec(cmd, (error, stdout, stderr) => {
          if (error) {
            console.error(`FFmpeg Error: ${stderr}`);
            reject(error);
          } else {
            resolve();
          }
        });
      });
    };

    // Iterative compression strategy
    // Pass 1: Good quality
    // Pass 2: Medium quality
    // Pass 3: Low quality (Aggressive)
    const compressionPasses = [
      "-compression_level 4 -q:v 60",
      "-compression_level 6 -q:v 30",
      "-compression_level 6 -q:v 10",
    ];

    let success = false;
    for (const params of compressionPasses) {
      console.log(`[${jobId}] Trying compression: ${params}`);
      try {
        await runFfmpeg(params);

        const stats = fs.statSync(outputWebP);
        const fileSizeKB = stats.size / 1024;
        console.log(`[${jobId}] Result size: ${fileSizeKB.toFixed(2)}KB`);

        if (fileSizeKB < 500) {
          success = true;
          break;
        } else {
          console.log(`[${jobId}] File too large, trying next pass...`);
        }
      } catch (err) {
        console.error(`[${jobId}] Pass failed:`, err);
      }
    }

    if (!success) {
      // If all passes fail or result is still too large, we might still send what we have
      // or throw error. WhatsApp strict limit is 500KB.
      const stats = fs.statSync(outputWebP);
      if (stats.size > 500 * 1024) {
        throw new Error(
          `Unable to compress under 500KB. Final size: ${(
            stats.size / 1024
          ).toFixed(2)}KB`
        );
      }
    }

    // 6. Send File & Cleanup
    res.download(outputWebP, "sticker.webp", (err) => {
      if (err) console.error(err);
      deleteFolderRecursive(tempDir);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    });
  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    if (fs.existsSync(tempDir)) deleteFolderRecursive(tempDir);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res
      .status(500)
      .json({ error: "Conversion Failed", details: error.message });
  }
});

// Start Server
const PORT = 8202;
app.listen(PORT, () => {
  console.log(`Sticker Converter running on port ${PORT}`);
  if (!fs.existsSync("temp")) fs.mkdirSync("temp");
  if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
});
