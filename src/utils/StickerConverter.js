import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";

// WhatsApp sticker requirements
const WHATSAPP_STICKER_SIZE = 512;
const WHATSAPP_TRAY_ICON_SIZE = 96;
const MAX_STICKER_FILE_SIZE = 100 * 1024; // 100 KB

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
   * Convert a sticker to WhatsApp format (512x512 WebP)
   */
  async convertToWhatsAppFormat(inputPath) {
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
      if (fileInfo.size > MAX_STICKER_FILE_SIZE) {
        return await this.compressSticker(outputPath);
      }

      return outputPath;
    } catch (error) {
      console.error("Error converting sticker:", error);
      // If conversion fails, try to copy the original
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
    if (fileInfo.size > MAX_STICKER_FILE_SIZE && quality > 0.3) {
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
   * Batch convert multiple stickers
   */
  async convertBatch(inputPaths, onProgress) {
    const results = [];
    const total = inputPaths.length;

    for (let i = 0; i < total; i++) {
      try {
        const convertedPath = await this.convertToWhatsAppFormat(inputPaths[i]);
        results.push({
          original: inputPaths[i],
          converted: convertedPath,
          success: true,
        });
      } catch (error) {
        results.push({
          original: inputPaths[i],
          error: error.message,
          success: false,
        });
      }

      if (onProgress) {
        onProgress((i + 1) / total);
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
