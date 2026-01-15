/**
 * Test script for the sticker conversion API
 * Run with: node test-api.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const FormData = require("form-data");
const fetch = require("node-fetch");

// Configuration - Replace with your actual bot token
const BOT_TOKEN = "8416259541:AAG-SmvkCpp0AAi4Kk2MquZfBiHWh0wRjOg";
const PACK_NAME = "FodaseGoverno";
const API_URL = "https://sticker-api.iitmandi.co.in/convert";

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

// Create temp directory
const TEMP_DIR = path.join(__dirname, "test_temp");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Make HTTPS request
 */
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = [];
      res.on("data", (chunk) => data.push(chunk));
      res.on("end", () => {
        if (res.headers["content-type"]?.includes("application/json")) {
          resolve(JSON.parse(Buffer.concat(data).toString()));
        } else {
          resolve(Buffer.concat(data));
        }
      });
    });
    req.on("error", reject);
  });
}

/**
 * Download file to disk
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(destPath);
        });
      })
      .on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
  });
}

/**
 * Test the conversion API with a file
 */
async function testConversionAPI(filePath, fileType = "tgs") {
  console.log("\n--- Testing Conversion API ---");
  console.log("File:", filePath);
  console.log("File type:", fileType);
  console.log("File exists:", fs.existsSync(filePath));
  console.log("File size:", fs.statSync(filePath).size, "bytes");

  const formData = new FormData();
  formData.append("sticker", fs.createReadStream(filePath), {
    filename: `sticker.${fileType}`,
    contentType: fileType === "tgs" ? "application/gzip" : "video/webm",
  });

  console.log("\nSending request to:", API_URL);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
      headers: formData.getHeaders(),
    });

    console.log("Response status:", response.status);
    console.log(
      "Response headers:",
      Object.fromEntries(response.headers.entries())
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return null;
    }

    const buffer = await response.buffer();
    console.log("Response size:", buffer.length, "bytes");

    // Save the result
    const outputPath = filePath.replace(".tgs", "_converted.webp");
    fs.writeFileSync(outputPath, buffer);
    console.log("Saved converted file to:", outputPath);

    return outputPath;
  } catch (error) {
    console.error("Request failed:", error.message);
    console.error("Full error:", error);
    return null;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log("=== Sticker Conversion API Test ===\n");

  // Step 1: Check if bot token is set
  if (BOT_TOKEN === "YOUR_BOT_TOKEN_HERE") {
    console.error("ERROR: Please set your BOT_TOKEN in the script first!");
    console.log(
      "\nEdit test-api.js and replace YOUR_BOT_TOKEN_HERE with your actual Telegram bot token."
    );
    process.exit(1);
  }

  // Step 2: Get sticker pack info
  console.log("Fetching sticker pack:", PACK_NAME);

  try {
    const packUrl = `${TELEGRAM_API}/getStickerSet?name=${PACK_NAME}`;
    console.log("API URL:", packUrl);

    const packResult = await httpsRequest(packUrl);

    if (!packResult.ok) {
      console.error("Failed to get sticker pack:", packResult.description);
      process.exit(1);
    }

    const pack = packResult.result;
    console.log("\nPack info:");
    console.log("  Name:", pack.name);
    console.log("  Title:", pack.title);
    console.log("  Sticker type:", pack.sticker_type);
    console.log("  Sticker format:", pack.sticker_format);
    console.log("  is_animated:", pack.is_animated);
    console.log("  is_video:", pack.is_video);
    console.log("  Sticker count:", pack.stickers.length);

    // Step 3: Get first sticker's file info
    const firstSticker = pack.stickers[0];
    console.log("\nFirst sticker:");
    console.log("  file_id:", firstSticker.file_id);
    console.log("  file_unique_id:", firstSticker.file_unique_id);
    console.log("  is_animated:", firstSticker.is_animated);
    console.log("  is_video:", firstSticker.is_video);

    // Step 4: Get file path
    const fileUrl = `${TELEGRAM_API}/getFile?file_id=${firstSticker.file_id}`;
    const fileResult = await httpsRequest(fileUrl);

    if (!fileResult.ok) {
      console.error("Failed to get file info:", fileResult.description);
      process.exit(1);
    }

    const filePath = fileResult.result.file_path;
    console.log("\nFile path:", filePath);
    console.log("File size:", fileResult.result.file_size, "bytes");

    // Determine file type based on sticker properties
    const isVideo = firstSticker.is_video || pack.is_video;
    const isAnimated = firstSticker.is_animated || pack.is_animated;
    let fileType = "webp";
    if (isVideo) fileType = "webm";
    else if (isAnimated) fileType = "tgs";

    console.log("\nSticker type detection:");
    console.log("  isVideo:", isVideo);
    console.log("  isAnimated:", isAnimated);
    console.log("  fileType:", fileType);

    // Step 5: Download the sticker
    const downloadUrl = `${TELEGRAM_FILE}/${filePath}`;
    console.log("\nDownloading from:", downloadUrl);

    const localPath = path.join(TEMP_DIR, `test_sticker.${fileType}`);
    await downloadFile(downloadUrl, localPath);
    console.log("Downloaded to:", localPath);

    // Step 6: Test the conversion API
    const convertedPath = await testConversionAPI(localPath, fileType);

    if (convertedPath) {
      console.log("\n=== SUCCESS ===");
      console.log("Converted sticker saved to:", convertedPath);
    } else {
      console.log("\n=== FAILED ===");
      console.log("Conversion API test failed");
    }
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  }
}

// Also test just the API endpoint connectivity
async function testAPIConnectivity() {
  console.log("\n--- Testing API Connectivity ---");

  try {
    // Test basic connectivity (might return error but at least connects)
    const response = await fetch(API_URL, {
      method: "GET",
    });

    console.log("GET request status:", response.status);
    const text = await response.text();
    console.log("Response:", text.substring(0, 200));
  } catch (error) {
    console.error("Connectivity test failed:", error.message);
  }
}

// Run tests
testAPIConnectivity().then(() => main());
