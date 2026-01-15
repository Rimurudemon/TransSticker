/**
 * LottieConverter - Handles TGS (Lottie) and WebM sticker processing
 *
 * TGS files are gzipped Lottie JSON animations used by Telegram.
 * WebM files are video stickers.
 *
 * Note: Full animated WebP conversion requires native processing.
 * This implementation provides decompression and fallback handling.
 */

import * as FileSystem from "expo-file-system/legacy";
import pako from "pako";

// WhatsApp animated sticker requirements
const WHATSAPP_STICKER_SIZE = 512;
const MAX_ANIMATED_SIZE = 500 * 1024; // 500 KB
const MAX_DURATION_MS = 3000; // WhatsApp max animated sticker duration

export default class LottieConverter {
  constructor() {
    this.workDir = FileSystem.documentDirectory + "transsticker/lottie_work/";
  }

  /**
   * Initialize work directories
   */
  async initWorkDir() {
    const workDirInfo = await FileSystem.getInfoAsync(this.workDir);
    if (!workDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.workDir, {
        intermediates: true,
      });
    }
  }

  /**
   * Clean up work directory
   */
  async cleanupWorkDir() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.workDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.workDir, { idempotent: true });
      }
    } catch (error) {
      console.warn("Failed to cleanup work directory:", error);
    }
  }

  /**
   * Decompress a TGS file to get Lottie JSON
   * @param {string} tgsPath - Path to the .tgs file
   * @returns {object} - Parsed Lottie JSON object
   */
  async decompressTgs(tgsPath) {
    try {
      // Read the TGS file as base64
      const base64Data = await FileSystem.readAsStringAsync(tgsPath, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Uint8Array
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decompress using pako (gzip)
      const decompressed = pako.inflate(bytes, { to: "string" });

      // Parse JSON
      const lottieJson = JSON.parse(decompressed);

      return lottieJson;
    } catch (error) {
      console.error("Failed to decompress TGS:", error);
      throw new Error(`Failed to decompress TGS file: ${error.message}`);
    }
  }

  /**
   * Save Lottie JSON to file
   * @param {object} lottieJson - Lottie animation object
   * @param {string} outputPath - Path to save the JSON file
   */
  async saveLottieJson(lottieJson, outputPath) {
    await FileSystem.writeAsStringAsync(
      outputPath,
      JSON.stringify(lottieJson),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
    return outputPath;
  }

  /**
   * Get animation info from Lottie JSON
   * @param {object} lottieJson - Lottie animation object
   * @returns {object} - Animation metadata
   */
  getAnimationInfo(lottieJson) {
    const frameRate = lottieJson.fr || 30;
    const inFrame = lottieJson.ip || 0;
    const outFrame = lottieJson.op || 60;
    const totalFrames = outFrame - inFrame;
    const durationSeconds = totalFrames / frameRate;
    const width = lottieJson.w || 512;
    const height = lottieJson.h || 512;

    return {
      frameRate,
      inFrame,
      outFrame,
      totalFrames,
      durationSeconds,
      durationMs: durationSeconds * 1000,
      width,
      height,
    };
  }

  /**
   * Convert WebM video sticker to animated WebP
   *
   * Note: Full WebM to animated WebP conversion requires FFmpeg or native processing.
   * Without native support, we return null to trigger fallback to static conversion.
   *
   * @param {string} webmPath - Path to WebM file
   * @param {string} outputPath - Output path for WebP
   * @returns {object} - { path, isAnimated, needsNativeProcessing }
   */
  async convertWebmToAnimatedWebp(webmPath, outputPath) {
    await this.initWorkDir();

    console.log("WebM conversion requested:", webmPath);
    console.warn(
      "WebM to animated WebP conversion requires FFmpeg or native processing. " +
        "Falling back to static sticker conversion."
    );

    // Without FFmpeg, we cannot convert WebM to animated WebP
    // Return null path to trigger fallback to static conversion
    return {
      path: null,
      isAnimated: false,
      needsNativeProcessing: true,
      originalFormat: "webm",
    };
  }

  /**
   * Convert TGS (Lottie) to animated WebP
   *
   * Note: Full TGS to animated WebP conversion requires:
   * 1. Rendering Lottie frames (requires lottie-android or similar)
   * 2. Encoding frames to animated WebP
   *
   * This implementation decompresses TGS and saves the Lottie JSON
   * for potential native rendering.
   *
   * @param {string} tgsPath - Path to TGS file
   * @param {string} outputPath - Output path for WebP
   * @returns {object} - { path, isAnimated, lottieJson? }
   */
  async convertTgsToAnimatedWebp(tgsPath, outputPath) {
    await this.initWorkDir();

    try {
      // Decompress TGS to get Lottie JSON
      const lottieJson = await this.decompressTgs(tgsPath);
      const animInfo = this.getAnimationInfo(lottieJson);

      console.log("Lottie animation info:", animInfo);

      // Save Lottie JSON for potential native rendering
      const lottieJsonPath = this.workDir + `lottie_${Date.now()}.json`;
      await this.saveLottieJson(lottieJson, lottieJsonPath);

      console.warn(
        "TGS to animated WebP conversion requires native Lottie rendering. " +
          "Saved Lottie JSON for potential native processing."
      );

      // Return info for potential native processing or fallback
      return {
        path: null, // No WebP output yet
        isAnimated: false, // Will be static fallback unless native processed
        needsNativeProcessing: true,
        lottieJsonPath,
        lottieJson,
        animationInfo: animInfo,
      };
    } catch (error) {
      console.error("TGS conversion failed:", error);
      return {
        path: null,
        isAnimated: false,
        error: error.message,
      };
    }
  }

  /**
   * Check conversion capabilities
   * @returns {object} - Capability report
   */
  async checkCapabilities() {
    return {
      available: true,
      tgsDecompression: true,
      tgsToAnimatedWebp: false, // Requires native module
      webmToAnimatedWebp: false, // Requires native module or FFmpeg
      note:
        "Full animated sticker conversion requires native processing. " +
        "TGS decompression and Lottie JSON extraction is available.",
    };
  }
}
