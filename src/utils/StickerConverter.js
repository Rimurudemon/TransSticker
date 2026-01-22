import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

// API Configuration
// For local development:
// - Android Emulator: use 10.0.2.2 (maps to host machine's localhost)
// - iOS Simulator: use localhost
// - Physical Device: use your computer's IP address (e.g., 192.168.x.x)
// For production: use "https://sticker-api.iitmandi.co.in"
// const API_BASE_URL = Platform.select({
//   android: "http://172.23.181.174:8203", // Android emulator -> host localhost
//   ios: "http://localhost:8203",    // iOS simulator
//   default: "http://172.23.181.174:8203",
// });
// Uncomment this line for production:
const API_BASE_URL = "https://sticker-api.iitmandi.co.in";

// WhatsApp sticker requirements
const WHATSAPP_STICKER_SIZE = 512;
const WHATSAPP_TRAY_ICON_SIZE = 96;
const MAX_STATIC_STICKER_SIZE = 100 * 1024; // 100 KB
const MAX_ANIMATED_STICKER_SIZE = 500 * 1024; // 500 KB

export default class StickerConverter {
  constructor() {
    this.outputDir = FileSystem.documentDirectory + "transsticker/converted/";
  }

  /**
   * Initialize the output directory
   */
  async initOutputDir() {
    const dirInfo = await FileSystem.getInfoAsync(this.outputDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.outputDir, {
        intermediates: true,
      });
    }
  }

  /**
   * Convert an animated sticker (TGS or WebM) to WhatsApp format (WebP) via API
   * @param {string} inputPath - Path to the sticker file
   * @param {string} stickerType - Type of sticker: 'tgs', 'webm', or auto-detect
   */
  async convertAnimatedSticker(inputPath, stickerType = null) {
    await this.initOutputDir();

    // Auto-detect sticker type from path if not provided
    const lowerPath = inputPath.toLowerCase();
    let detectedType = stickerType;
    let mimeType = "application/octet-stream";
    let fileName = "sticker.bin";

    if (!detectedType) {
      if (lowerPath.endsWith(".tgs")) {
        detectedType = "tgs";
      } else if (lowerPath.endsWith(".webm")) {
        detectedType = "webm";
      } else {
        detectedType = "tgs"; // Default to TGS
      }
    }

    // Set correct MIME type and filename based on sticker type
    if (detectedType === "webm") {
      mimeType = "video/webm";
      fileName = "sticker.webm";
    } else {
      mimeType = "application/gzip";
      fileName = "sticker.tgs";
    }

    console.log(`Converting ${detectedType} sticker:`, inputPath);

    const formData = new FormData();
    formData.append("sticker", {
      uri: inputPath,
      name: fileName,
      type: mimeType,
    });

    try {
      console.log(`Sending ${detectedType} sticker to conversion API...`);

      // Set up timeout for API call (2 minutes for TGS which uses Puppeteer)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(
        `${API_BASE_URL}/convert`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Conversion API error:", response.status, errorText);
        throw new Error(
          `Conversion API failed with status ${response.status}: ${errorText}`
        );
      }

      console.log("Conversion API success, processing response...");
      const blob = await response.blob();

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          try {
            const base64data = reader.result.split(",")[1];
            const filename = `sticker_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}.webp`;
            const outputPath = this.outputDir + filename;

            await FileSystem.writeAsStringAsync(outputPath, base64data, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Validate Animated Sticker Size (Max 500KB)
            const fileInfo = await FileSystem.getInfoAsync(outputPath);
            if (fileInfo.size > MAX_ANIMATED_STICKER_SIZE) {
              await FileSystem.deleteAsync(outputPath, { idempotent: true });
              throw new Error(
                `Animated sticker too large: ${(fileInfo.size / 1024).toFixed(
                  2
                )}KB (Max 500KB)`
              );
            }

            resolve(outputPath);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (err) => reject(err);
      });
    } catch (error) {
      console.error("Error converting animated sticker:", error);
      throw error;
    }
  }

  /**
   * Convert a sticker to WhatsApp format (512x512 WebP)
   */
  async convertToWhatsAppFormat(inputPath, isAnimated = false) {
    if (isAnimated) {
      return this.convertAnimatedSticker(inputPath);
    }

    await this.initOutputDir();

    try {
      // Resize to 512x512
      const result = await ImageManipulator.manipulateAsync(
        inputPath,
        [
          {
            resize: {
              width: WHATSAPP_STICKER_SIZE,
              height: WHATSAPP_STICKER_SIZE,
            },
          },
        ],
        {
          format: ImageManipulator.SaveFormat.WEBP,
          compress: 0.9,
        }
      );

      // Generate output filename
      const filename = `sticker_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}.webp`;
      const outputPath = this.outputDir + filename;

      // Move/copy the result to our output directory
      await FileSystem.copyAsync({
        from: result.uri,
        to: outputPath,
      });

      // Check file size and compress more if needed
      const fileInfo = await FileSystem.getInfoAsync(outputPath);
      if (fileInfo.size > MAX_STATIC_STICKER_SIZE) {
        return await this.compressSticker(outputPath);
      }

      return outputPath;
    } catch (error) {
      console.error("Error converting sticker:", error);

      // If animated conversion failed, do NOT copy original as it might be invalid (e.g. webm -> webp)
      if (isAnimated) {
        throw new Error(`Animated sticker conversion failed: ${error.message}`);
      }

      // If conversion fails for static, try to copy the original
      const filename = `sticker_${Date.now()}.webp`;
      const outputPath = this.outputDir + filename;
      await FileSystem.copyAsync({
        from: inputPath,
        to: outputPath,
      });
      return outputPath;
    }
  }

  /**
   * Compress a sticker to meet size requirements
   */
  async compressSticker(inputPath, quality = 0.8) {
    const result = await ImageManipulator.manipulateAsync(inputPath, [], {
      format: ImageManipulator.SaveFormat.WEBP,
      compress: quality,
    });

    // Replace the original file
    await FileSystem.deleteAsync(inputPath, { idempotent: true });
    await FileSystem.copyAsync({
      from: result.uri,
      to: inputPath,
    });

    // Check if still too large
    const fileInfo = await FileSystem.getInfoAsync(inputPath);
    if (fileInfo.size > MAX_STATIC_STICKER_SIZE && quality > 0.3) {
      return await this.compressSticker(inputPath, quality - 0.1);
    }

    return inputPath;
  }

  /**
   * Create a tray icon (96x96) from a sticker
   * WhatsApp requires PNG format for tray icons, max 50KB
   */
  async createTrayIcon(inputPath) {
    await this.initOutputDir();

    try {
      const result = await ImageManipulator.manipulateAsync(
        inputPath,
        [
          {
            resize: {
              width: WHATSAPP_TRAY_ICON_SIZE,
              height: WHATSAPP_TRAY_ICON_SIZE,
            },
          },
        ],
        {
          format: ImageManipulator.SaveFormat.PNG,
          compress: 0.9,
        }
      );

      const filename = `tray_${Date.now()}.png`;
      const outputPath = this.outputDir + filename;

      await FileSystem.copyAsync({
        from: result.uri,
        to: outputPath,
      });

      console.log(`Created tray icon at: ${outputPath}`);

      return outputPath;
    } catch (error) {
      console.error("Error creating tray icon:", error);
      throw error;
    }
  }

  /**
   * Convert multiple animated stickers via batch API
   * @param {Array} inputPaths - Array of sticker file paths
   * @param {Function} onProgress - Progress callback (0-1)
   * @returns {Array} Array of {original, converted, success, error}
   */
  async convertAnimatedBatch(inputPaths, onProgress) {
    await this.initOutputDir();

    const formData = new FormData();
    
    for (const inputPath of inputPaths) {
      const lowerPath = inputPath.toLowerCase();
      let mimeType = "application/gzip";
      let fileName = "sticker.tgs";
      
      if (lowerPath.endsWith(".webm")) {
        mimeType = "video/webm";
        fileName = `sticker_${Date.now()}.webm`;
      } else if (lowerPath.endsWith(".tgs")) {
        fileName = `sticker_${Date.now()}.tgs`;
      }

      formData.append("stickers", {
        uri: inputPath,
        name: fileName,
        type: mimeType,
      });
    }

    try {
      console.log(`Sending ${inputPaths.length} stickers to batch conversion API...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout for batch

      const response = await fetch(
        `${API_BASE_URL}/convert-batch`,
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Batch API failed: ${response.status} - ${errorText}`);
      }

      const batchResult = await response.json();
      console.log(`Batch conversion complete: ${batchResult.succeeded}/${batchResult.total} in ${batchResult.elapsed}`);

      const results = [];
      const total = batchResult.results.length;

      for (let i = 0; i < batchResult.results.length; i++) {
        const result = batchResult.results[i];
        
        if (result.success) {
          try {
            const filename = `sticker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.webp`;
            const outputPath = this.outputDir + filename;

            await FileSystem.writeAsStringAsync(outputPath, result.data, {
              encoding: FileSystem.EncodingType.Base64,
            });

            results.push({
              original: inputPaths[i],
              converted: outputPath,
              success: true,
              sizeKB: result.sizeKB,
            });
          } catch (err) {
            results.push({
              original: inputPaths[i],
              error: `Failed to save: ${err.message}`,
              success: false,
            });
          }
        } else {
          results.push({
            original: inputPaths[i],
            error: result.error,
            success: false,
          });
        }

        if (onProgress) {
          onProgress((i + 1) / total);
        }
      }

      return results;
    } catch (error) {
      console.error("Batch conversion failed:", error);
      // Fall back to parallel individual conversions
      console.log("Falling back to parallel individual conversions...");
      return this.convertBatchParallel(inputPaths, onProgress);
    }
  }

  /**
   * Batch convert multiple stickers with parallelism
   * @param {Array} inputPaths - Array of sticker paths
   * @param {Function} onProgress - Progress callback (0-1)
   * @param {Object} options - Options including isAnimated and concurrency
   */
  async convertBatch(inputPaths, onProgress, options = {}) {
    const { isAnimated = false, concurrency = 4, useBatchApi = true } = options;

    // For animated stickers, try batch API first if enabled
    if (isAnimated && useBatchApi) {
      try {
        return await this.convertAnimatedBatch(inputPaths, onProgress);
      } catch (error) {
        console.warn("Batch API failed, falling back to parallel conversion:", error.message);
      }
    }

    // Use parallel conversion with controlled concurrency
    return this.convertBatchParallel(inputPaths, onProgress, { isAnimated, concurrency });
  }

  /**
   * Convert stickers in parallel with controlled concurrency
   */
  async convertBatchParallel(inputPaths, onProgress, options = {}) {
    const { isAnimated = false, concurrency = 4 } = options;
    const results = [];
    const total = inputPaths.length;
    let completed = 0;

    // Process in chunks for controlled concurrency
    for (let i = 0; i < total; i += concurrency) {
      const chunk = inputPaths.slice(i, Math.min(i + concurrency, total));
      
      const chunkPromises = chunk.map(async (inputPath) => {
        try {
          const convertedPath = await this.convertToWhatsAppFormat(inputPath, isAnimated);
          return {
            original: inputPath,
            converted: convertedPath,
            success: true,
          };
        } catch (error) {
          return {
            original: inputPath,
            error: error.message,
            success: false,
          };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
      
      completed += chunk.length;
      if (onProgress) {
        onProgress(completed / total);
      }
    }

    return results;
  }

  /**
   * Validate sticker requirements
   */
  async validateSticker(filePath) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      if (!fileInfo.exists) {
        return { valid: false, error: "File does not exist" };
      }

      if (fileInfo.size > MAX_STICKER_FILE_SIZE) {
        return { valid: false, error: "File size exceeds 100 KB limit" };
      }

      // Additional validation could include:
      // - Checking image dimensions
      // - Verifying WebP format
      // - Checking for transparency

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Get sticker metadata
   */
  async getStickerInfo(filePath) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);

      return {
        path: filePath,
        size: fileInfo.size,
        sizeKB: Math.round(fileInfo.size / 1024),
        exists: fileInfo.exists,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Clean up converted files
   */
  async cleanup() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.outputDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.outputDir, { idempotent: true });
      }
    } catch (error) {
      console.error("Cleanup failed:", error);
    }
  }
}
