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

// CORS middleware for cross-origin requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// WhatsApp Limits
const MAX_SIZE_PX = 512;
const MAX_SIZE_KB = 500;
const FPS = 20; // Reduced from 30 to save size

// Parallel processing configuration
const MAX_CONCURRENT_JOBS = 3; // Max parallel conversions per batch request (reduced to avoid memory issues)
const MAX_BATCH_SIZE = 15; // Max stickers per batch request

// Multer configuration with increased limits for batch uploads
const multerConfig = multer({
  dest: "uploads/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: MAX_BATCH_SIZE
  }
});
const BATCH_UPLOAD = multerConfig.array("stickers", MAX_BATCH_SIZE);

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
    console.log(`[${jobId}] Encoding WebP with enhanced multi-level compression...`);

    // Enhanced compression strategy with multiple levels:
    // - Progressively lower quality
    // - Reduced FPS for larger files
    // - Resolution scaling as last resort
    // - Duration trimming for very large files
    
    const runFfmpegWithSettings = (params, outputPath, settings = {}) => {
      const fps = settings.fps || FPS;
      const scale = settings.scale || MAX_SIZE_PX;
      const duration = settings.duration || 10;
      
      return new Promise((resolve, reject) => {
        const cmd = `ffmpeg ${ffmpegInputOptions} -y -i ${ffmpegInput} -t ${duration} -vf "fps=${fps},scale=${scale}:${scale}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${scale}:${scale}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -c:v libwebp -lossless 0 -preset default -loop 0 -an -vsync 0 ${params} "${outputPath}"`;
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
    
    // Multi-level compression passes - more aggressive for larger files
    const compressionPasses = [
      // Level 1-3: High quality, full specs
      { params: "-compression_level 4 -q:v 80", name: "Level 1: Excellent Quality", fps: 20, scale: 512, duration: 10 },
      { params: "-compression_level 4 -q:v 70", name: "Level 2: Very High Quality", fps: 20, scale: 512, duration: 10 },
      { params: "-compression_level 5 -q:v 60", name: "Level 3: High Quality", fps: 20, scale: 512, duration: 10 },
      
      // Level 4-6: Good quality, slight FPS reduction
      { params: "-compression_level 5 -q:v 50", name: "Level 4: Good Quality", fps: 18, scale: 512, duration: 10 },
      { params: "-compression_level 5 -q:v 40", name: "Level 5: Good Quality (Lower)", fps: 16, scale: 512, duration: 10 },
      { params: "-compression_level 6 -q:v 35", name: "Level 6: Medium-Good Quality", fps: 15, scale: 512, duration: 10 },
      
      // Level 7-9: Medium quality, reduced FPS
      { params: "-compression_level 6 -q:v 30", name: "Level 7: Medium Quality", fps: 15, scale: 512, duration: 8 },
      { params: "-compression_level 6 -q:v 25", name: "Level 8: Medium Quality (Lower)", fps: 12, scale: 512, duration: 8 },
      { params: "-compression_level 6 -q:v 20", name: "Level 9: Medium-Low Quality", fps: 12, scale: 512, duration: 6 },
      
      // Level 10-12: Lower quality, reduced FPS + shorter duration
      { params: "-compression_level 6 -q:v 15", name: "Level 10: Low Quality", fps: 10, scale: 512, duration: 6 },
      { params: "-compression_level 6 -q:v 12", name: "Level 11: Low Quality (Lower)", fps: 10, scale: 512, duration: 5 },
      { params: "-compression_level 6 -q:v 10", name: "Level 12: Very Low Quality", fps: 10, scale: 512, duration: 5 },
      
      // Level 13-15: Aggressive - reduced resolution as last resort
      { params: "-compression_level 6 -q:v 10", name: "Level 13: Aggressive (480p)", fps: 10, scale: 480, duration: 5 },
      { params: "-compression_level 6 -q:v 8", name: "Level 14: Very Aggressive (448p)", fps: 8, scale: 448, duration: 4 },
      { params: "-compression_level 6 -q:v 5", name: "Level 15: Ultra Aggressive (400p)", fps: 8, scale: 400, duration: 3 },
    ];

    let finalOutput = null;
    let bestSize = Infinity;
    let successLevel = null;

    for (let i = 0; i < compressionPasses.length; i++) {
      const pass = compressionPasses[i];
      const tempOutput = path.join(tempDir, `attempt_${i}.webp`);

      console.log(`[${jobId}] Trying ${pass.name} (FPS: ${pass.fps}, Scale: ${pass.scale}px, Duration: ${pass.duration}s)`);

      try {
        await runFfmpegWithSettings(pass.params, tempOutput, {
          fps: pass.fps,
          scale: pass.scale,
          duration: pass.duration
        });

        if (fs.existsSync(tempOutput)) {
          const stats = fs.statSync(tempOutput);
          const fileSizeKB = stats.size / 1024;
          console.log(
            `[${jobId}] ${pass.name} result: ${fileSizeKB.toFixed(2)}KB`
          );

          // If under limit, use this one and stop
          if (fileSizeKB < MAX_SIZE_KB) {
            console.log(`[${jobId}] ✓ Success at ${pass.name}! File is ${fileSizeKB.toFixed(2)}KB (under ${MAX_SIZE_KB}KB)`);
            // Clean up previous best attempt if exists
            if (finalOutput && finalOutput !== tempOutput && fs.existsSync(finalOutput)) {
              fs.unlinkSync(finalOutput);
            }
            finalOutput = tempOutput;
            successLevel = pass.name;
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
    
    // Log compression summary
    if (successLevel) {
      console.log(`[${jobId}] Compression completed using: ${successLevel}`);
    } else {
      console.log(`[${jobId}] Warning: Could not get under ${MAX_SIZE_KB}KB, using best attempt (${(bestSize/1024).toFixed(2)}KB)`);
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

/**
 * Helper: Convert a single sticker file and return its buffer
 * This is extracted to be reusable for both single and batch endpoints
 */
async function convertSingleSticker(file) {
  const jobId = uuidv4();
  const tempDir = path.join(__dirname, "temp", jobId);
  const framesDir = path.join(tempDir, "frames");
  const outputWebP = path.join(tempDir, "output.webp");

  // Create temp directory for this specific job
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    console.log(`[${jobId}] Processing started. File type: ${file.mimetype}`);

    // --- TYPE DETECTION ---
    const isWebM =
      file.mimetype.includes("video") ||
      file.originalname.toLowerCase().endsWith(".webm");

    let ffmpegInput = "";
    let ffmpegInputOptions = "";

    if (isWebM) {
      console.log(`[${jobId}] Detected WebM video. Bypassing Puppeteer.`);
      ffmpegInput = `"${file.path}"`;
    } else {
      console.log(`[${jobId}] Detected TGS/Lottie. Starting Puppeteer.`);

      if (!fs.existsSync(framesDir))
        fs.mkdirSync(framesDir, { recursive: true });

      const tgsBuffer = fs.readFileSync(file.path);
      let lottieData;
      try {
        lottieData = zlib.gunzipSync(tgsBuffer).toString("utf-8");
      } catch (err) {
        lottieData = tgsBuffer.toString("utf-8");
      }

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

      const totalFrames = await page.evaluate(() => window.getTotalFrames());
      const frameLimit = Math.min(totalFrames, FPS * 3);

      for (let i = 0; i < frameLimit; i++) {
        await page.evaluate((frame) => window.seekToFrame(frame), i);
        const fileName = `frame_${String(i).padStart(3, "0")}.png`;
        await page.screenshot({
          path: path.join(framesDir, fileName),
          omitBackground: true,
        });
      }
      await browser.close();

      ffmpegInput = `"${framesDir}/frame_%03d.png"`;
      ffmpegInputOptions = `-framerate ${FPS}`;
    }

    console.log(`[${jobId}] Encoding WebP with enhanced multi-level compression...`);

    const runFfmpegWithSettings = (params, outputPath, settings = {}) => {
      const fps = settings.fps || FPS;
      const scale = settings.scale || MAX_SIZE_PX;
      const duration = settings.duration || 10;

      return new Promise((resolve, reject) => {
        const cmd = `ffmpeg ${ffmpegInputOptions} -y -i ${ffmpegInput} -t ${duration} -vf "fps=${fps},scale=${scale}:${scale}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${scale}:${scale}:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -c:v libwebp -lossless 0 -preset default -loop 0 -an -vsync 0 ${params} "${outputPath}"`;
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

    const compressionPasses = [
      { params: "-compression_level 4 -q:v 80", name: "Level 1: Excellent Quality", fps: 20, scale: 512, duration: 10 },
      { params: "-compression_level 4 -q:v 70", name: "Level 2: Very High Quality", fps: 20, scale: 512, duration: 10 },
      { params: "-compression_level 5 -q:v 60", name: "Level 3: High Quality", fps: 20, scale: 512, duration: 10 },
      { params: "-compression_level 5 -q:v 50", name: "Level 4: Good Quality", fps: 18, scale: 512, duration: 10 },
      { params: "-compression_level 5 -q:v 40", name: "Level 5: Good Quality (Lower)", fps: 16, scale: 512, duration: 10 },
      { params: "-compression_level 6 -q:v 35", name: "Level 6: Medium-Good Quality", fps: 15, scale: 512, duration: 10 },
      { params: "-compression_level 6 -q:v 30", name: "Level 7: Medium Quality", fps: 15, scale: 512, duration: 8 },
      { params: "-compression_level 6 -q:v 25", name: "Level 8: Medium Quality (Lower)", fps: 12, scale: 512, duration: 8 },
      { params: "-compression_level 6 -q:v 20", name: "Level 9: Medium-Low Quality", fps: 12, scale: 512, duration: 6 },
      { params: "-compression_level 6 -q:v 15", name: "Level 10: Low Quality", fps: 10, scale: 512, duration: 6 },
      { params: "-compression_level 6 -q:v 12", name: "Level 11: Low Quality (Lower)", fps: 10, scale: 512, duration: 5 },
      { params: "-compression_level 6 -q:v 10", name: "Level 12: Very Low Quality", fps: 10, scale: 512, duration: 5 },
      { params: "-compression_level 6 -q:v 10", name: "Level 13: Aggressive (480p)", fps: 10, scale: 480, duration: 5 },
      { params: "-compression_level 6 -q:v 8", name: "Level 14: Very Aggressive (448p)", fps: 8, scale: 448, duration: 4 },
      { params: "-compression_level 6 -q:v 5", name: "Level 15: Ultra Aggressive (400p)", fps: 8, scale: 400, duration: 3 },
    ];

    let finalOutput = null;
    let bestSize = Infinity;

    for (let i = 0; i < compressionPasses.length; i++) {
      const pass = compressionPasses[i];
      const tempOutput = path.join(tempDir, `attempt_${i}.webp`);

      console.log(`[${jobId}] Trying ${pass.name} (FPS: ${pass.fps}, Scale: ${pass.scale}px, Duration: ${pass.duration}s)`);

      try {
        await runFfmpegWithSettings(pass.params, tempOutput, {
          fps: pass.fps,
          scale: pass.scale,
          duration: pass.duration
        });

        if (fs.existsSync(tempOutput)) {
          const stats = fs.statSync(tempOutput);
          const fileSizeKB = stats.size / 1024;
          console.log(`[${jobId}] ${pass.name} result: ${fileSizeKB.toFixed(2)}KB`);

          if (fileSizeKB < MAX_SIZE_KB) {
            console.log(`[${jobId}] ✓ Success at ${pass.name}! File is ${fileSizeKB.toFixed(2)}KB`);
            if (finalOutput && finalOutput !== tempOutput && fs.existsSync(finalOutput)) {
              fs.unlinkSync(finalOutput);
            }
            finalOutput = tempOutput;
            break;
          }

          if (stats.size < bestSize) {
            bestSize = stats.size;
            if (finalOutput && finalOutput !== tempOutput && fs.existsSync(finalOutput)) {
              fs.unlinkSync(finalOutput);
            }
            finalOutput = tempOutput;
          } else {
            fs.unlinkSync(tempOutput);
          }
        }
      } catch (err) {
        console.error(`[${jobId}] ${pass.name} failed:`, err.message);
      }
    }

    if (!finalOutput || !fs.existsSync(finalOutput)) {
      throw new Error("All compression attempts failed");
    }

    const finalStats = fs.statSync(finalOutput);
    const finalSizeKB = finalStats.size / 1024;

    if (finalSizeKB >= MAX_SIZE_KB) {
      throw new Error(
        `Unable to compress under ${MAX_SIZE_KB}KB. Final size: ${finalSizeKB.toFixed(2)}KB`
      );
    }

    // Move final output to expected location
    if (finalOutput !== outputWebP) {
      fs.renameSync(finalOutput, outputWebP);
    }

    console.log(`[${jobId}] ✓ Conversion complete: ${finalSizeKB.toFixed(2)}KB`);

    // Read the output file into a buffer
    const resultBuffer = fs.readFileSync(outputWebP);

    // Cleanup
    deleteFolderRecursive(tempDir);
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    return {
      success: true,
      data: resultBuffer.toString("base64"),
      originalName: file.originalname,
      sizeKB: finalSizeKB.toFixed(2)
    };
  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    if (fs.existsSync(tempDir)) deleteFolderRecursive(tempDir);
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    return {
      success: false,
      error: error.message,
      originalName: file.originalname
    };
  }
}

/**
 * Helper: Process array in chunks with limited concurrency
 */
async function processWithConcurrency(items, processor, concurrency) {
  const results = [];
  
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);
  }
  
  return results;
}

/**
 * POST /convert-batch
 * Accepts multipart/form-data with multiple files named 'stickers'
 * Returns JSON array with conversion results
 */
app.post("/convert-batch", (req, res, next) => {
  // Handle multer errors (file too large, too many files, etc.)
  BATCH_UPLOAD(req, res, (err) => {
    if (err) {
      console.error("[BATCH] Multer error:", err.message);
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          error: `Too many files. Maximum ${MAX_BATCH_SIZE} files per batch.` 
        });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          error: "File too large. Maximum 5MB per file." 
        });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  const batchId = uuidv4();
  const fileCount = req.files.length;
  console.log(`[BATCH-${batchId}] Starting batch conversion of ${fileCount} stickers with concurrency ${MAX_CONCURRENT_JOBS}`);
  console.log(`[BATCH-${batchId}] File types: ${req.files.map(f => f.originalname?.split('.').pop() || 'unknown').join(', ')}`);

  try {
    const startTime = Date.now();
    
    // Process stickers in parallel with limited concurrency
    const results = await processWithConcurrency(
      req.files,
      convertSingleSticker,
      MAX_CONCURRENT_JOBS
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[BATCH-${batchId}] ✓ Batch complete in ${elapsed}s: ${successCount} succeeded, ${failCount} failed`);

    res.json({
      batchId,
      total: req.files.length,
      succeeded: successCount,
      failed: failCount,
      elapsed: `${elapsed}s`,
      results
    });
  } catch (error) {
    console.error(`[BATCH-${batchId}] Batch conversion failed:`, error);
    
    // Cleanup any remaining uploaded files
    for (const file of req.files) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    res.status(500).json({ 
      error: "Batch conversion failed", 
      details: error.message 
    });
  }
});

// Start Server
const PORT = process.env.PORT || 8202;
app.listen(PORT, () => {
  console.log(`Sticker Converter running on port ${PORT}`);
  console.log(`- Single conversion: POST /convert`);
  console.log(`- Batch conversion: POST /convert-batch (max concurrency: ${MAX_CONCURRENT_JOBS})`);
  if (!fs.existsSync("temp")) fs.mkdirSync("temp");
  if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
});
