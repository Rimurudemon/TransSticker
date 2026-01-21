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
const MAX_SIZE_KB = 500;
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

    // === COMMON STEP: FFMPEG ENCODING WITH SMART COMPRESSION ===
    console.log(`[${jobId}] Encoding WebP...`);

    const runFfmpeg = (params, outputPath) => {
      return new Promise((resolve, reject) => {
        const cmd = `ffmpeg ${ffmpegInputOptions} -y -i ${ffmpegInput} -t 10 -vf "fps=${FPS},scale=${MAX_SIZE_PX}:${MAX_SIZE_PX}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${MAX_SIZE_PX}:${MAX_SIZE_PX}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -c:v libwebp -lossless 0 -preset default -loop 0 -an -vsync 0 ${params} "${outputPath}"`;
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

    // Compression strategy: Try progressively lower quality until under size limit
    const compressionPasses = [
      { params: "-compression_level 4 -q:v 75", name: "High Quality" },
      { params: "-compression_level 4 -q:v 60", name: "Good Quality" },
      { params: "-compression_level 6 -q:v 40", name: "Medium Quality" },
      { params: "-compression_level 6 -q:v 25", name: "Low Quality" },
      { params: "-compression_level 6 -q:v 10", name: "Very Low Quality" },
    ];

    let finalOutput = null;
    let bestSize = Infinity;

    for (let i = 0; i < compressionPasses.length; i++) {
      const pass = compressionPasses[i];
      const tempOutput = path.join(tempDir, `attempt_${i}.webp`);

      console.log(`[${jobId}] Trying ${pass.name}: ${pass.params}`);

      try {
        await runFfmpeg(pass.params, tempOutput);

        if (fs.existsSync(tempOutput)) {
          const stats = fs.statSync(tempOutput);
          const fileSizeKB = stats.size / 1024;
          console.log(
            `[${jobId}] ${pass.name} result: ${fileSizeKB.toFixed(2)}KB`
          );

          // If under limit, use this one and stop
          if (fileSizeKB < MAX_SIZE_KB) {
            console.log(`[${jobId}] ✓ Success! File is under ${MAX_SIZE_KB}KB`);
            finalOutput = tempOutput;
            break;
          }

          // Track the smallest result in case we need it
          if (stats.size < bestSize) {
            bestSize = stats.size;
            // Clean up previous best attempt if exists
            if (
              finalOutput &&
              finalOutput !== tempOutput &&
              fs.existsSync(finalOutput)
            ) {
              fs.unlinkSync(finalOutput);
            }
            finalOutput = tempOutput;
          } else {
            // This attempt was larger, delete it
            fs.unlinkSync(tempOutput);
          }
        }
      } catch (err) {
        console.error(`[${jobId}] ${pass.name} failed:`, err.message);
        // Continue to next pass
      }
    }

    // Check if we got any valid output
    if (!finalOutput || !fs.existsSync(finalOutput)) {
      throw new Error("All compression attempts failed");
    }

    // Check final file size
    const finalStats = fs.statSync(finalOutput);
    const finalSizeKB = finalStats.size / 1024;

    if (finalSizeKB >= MAX_SIZE_KB) {
      throw new Error(
        `Unable to compress under ${MAX_SIZE_KB}KB. Final size: ${finalSizeKB.toFixed(
          2
        )}KB. Try using a shorter animation or simpler graphics.`
      );
    }

    // Move final output to expected location
    if (finalOutput !== outputWebP) {
      fs.renameSync(finalOutput, outputWebP);
    }

    console.log(
      `[${jobId}] ✓ Conversion complete: ${finalSizeKB.toFixed(2)}KB`
    );

    // Send File & Cleanup
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
