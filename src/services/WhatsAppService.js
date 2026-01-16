/**
 * WhatsApp Sticker Integration Service
 *
 * This service integrates with the native WhatsAppStickers module
 * for full sticker pack integration with WhatsApp.
 */

import { NativeModules, Linking, Platform, Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const { WhatsAppStickers } = NativeModules;

export default class WhatsAppService {
  constructor() {
    this.packDir =
      FileSystem.documentDirectory + "transsticker/whatsapp_packs/";
  }

  /**
   * Check if native module is available
   */
  isNativeModuleAvailable() {
    return Platform.OS === "android" && WhatsAppStickers != null;
  }

  /**
   * Check if WhatsApp is installed
   */
  async isWhatsAppInstalled() {
    try {
      // First try native module (more reliable)
      if (this.isNativeModuleAvailable()) {
        return await WhatsAppStickers.isWhatsAppInstalled();
      }
      // Fallback to Linking
      const canOpen = await Linking.canOpenURL("whatsapp://");
      return canOpen;
    } catch (error) {
      console.error("Error checking WhatsApp installation:", error);
      return false;
    }
  }

  /**
   * Check if WhatsApp Business is installed
   */
  async isWhatsAppBusinessInstalled() {
    try {
      const canOpen = await Linking.canOpenURL("whatsapp-business://");
      return canOpen;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create and register a sticker pack for WhatsApp
   *
   * Pack requirements:
   * - Identifier: Unique string
   * - Name: Display name (max 128 chars)
   * - Publisher: Publisher name (max 128 chars)
   * - Tray image: 96x96 PNG/WebP
   * - Stickers: 3-30 stickers, each 512x512 WebP, max 100KB
   */
  async createPack(packData) {
    const {
      identifier,
      name,
      publisher,
      trayImagePath,
      stickers,
      publisherEmail,
      publisherWebsite,
      privacyPolicyWebsite,
      licenseAgreementWebsite,
      animatedStickerPack,
    } = packData;

    // Validate pack
    if (!identifier || !name || !publisher) {
      throw new Error("Pack identifier, name, and publisher are required");
    }

    if (stickers.length < 3) {
      throw new Error("Minimum 3 stickers required");
    }

    if (stickers.length > 30) {
      throw new Error("Maximum 30 stickers allowed");
    }

    // Create pack directory
    const packPath = this.packDir + identifier + "/";
    const dirInfo = await FileSystem.getInfoAsync(packPath);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(packPath, { intermediates: true });
    }

    // Copy tray image (PNG format for WhatsApp tray icons)
    const trayDestPath = packPath + "tray.png";
    await FileSystem.copyAsync({
      from: trayImagePath,
      to: trayDestPath,
    });

    // Copy stickers and build sticker array for native module
    const stickerArray = [];
    for (let i = 0; i < stickers.length; i++) {
      const sticker = stickers[i];
      const fileName = `sticker_${i}.webp`;
      const stickerDestPath = packPath + fileName;

      console.log(
        `Copying sticker ${i}: from ${sticker.localPath} to ${stickerDestPath}`
      );

      await FileSystem.copyAsync({
        from: sticker.localPath,
        to: stickerDestPath,
      });

      // Get the real file path (remove file:// prefix if present)
      let filePath = stickerDestPath;
      if (filePath.startsWith("file://")) {
        filePath = filePath.substring(7);
      }

      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(stickerDestPath);
      console.log(
        `Sticker ${i} exists: ${fileInfo.exists}, size: ${fileInfo.size}, path: ${filePath}`
      );

      stickerArray.push({
        fileName: fileName,
        filePath: filePath,
        emojis: sticker.emojis || ["😀"],
      });
    }

    // Get tray file path
    let trayFilePath = trayDestPath;
    if (trayFilePath.startsWith("file://")) {
      trayFilePath = trayFilePath.substring(7);
    }

    // Verify tray icon exists
    const trayInfo = await FileSystem.getInfoAsync(trayDestPath);
    console.log(
      `Tray icon exists: ${trayInfo.exists}, size: ${trayInfo.size}, path: ${trayFilePath}`
    );

    // Create pack metadata
    const packMetadata = {
      identifier,
      name,
      publisher,
      trayImageFile: "tray.png",
      trayImagePath: trayFilePath,
      publisherEmail: publisherEmail || "",
      publisherWebsite: publisherWebsite || "",
      privacyPolicyWebsite: privacyPolicyWebsite || "",
      licenseAgreementWebsite: licenseAgreementWebsite || "",
      animatedStickerPack: !!animatedStickerPack,
      stickers: stickerArray,
    };

    // Save metadata locally
    const metadataPath = packPath + "metadata.json";
    await FileSystem.writeAsStringAsync(
      metadataPath,
      JSON.stringify(packMetadata, null, 2)
    );

    // Register with native module if available
    if (this.isNativeModuleAvailable()) {
      await WhatsAppStickers.registerStickerPack(packMetadata);
      console.log("Registered sticker pack with native module:", name);
    }

    return packMetadata;
  }

  /**
   * Add sticker pack to WhatsApp
   *
   * This uses the native module to communicate with WhatsApp
   * via the stickers protocol.
   */
  async addPackToWhatsApp(packIdentifier, packName) {
    if (Platform.OS !== "android") {
      throw new Error("WhatsApp sticker packs are only supported on Android");
    }

    const isInstalled = await this.isWhatsAppInstalled();
    if (!isInstalled) {
      throw new Error("WhatsApp is not installed");
    }

    if (!this.isNativeModuleAvailable()) {
      throw new Error(
        "Native WhatsApp Stickers module not available. " +
          "Please build the app with 'npx expo run:android' or use EAS Build."
      );
    }

    // Load pack metadata to ensure it's registered
    const packPath = this.packDir + packIdentifier + "/";
    const metadataPath = packPath + "metadata.json";
    const metadataInfo = await FileSystem.getInfoAsync(metadataPath);

    if (metadataInfo.exists) {
      const metadataStr = await FileSystem.readAsStringAsync(metadataPath);
      const metadata = JSON.parse(metadataStr);

      // Re-register pack to ensure it's in the ContentProvider
      await WhatsAppStickers.registerStickerPack(metadata);
    }

    // Send pack to WhatsApp
    return await WhatsAppStickers.addStickerPackToWhatsApp(
      packIdentifier,
      packName || packIdentifier
    );
  }

  /**
   * Get the content provider authority
   */
  async getAuthority() {
    if (this.isNativeModuleAvailable()) {
      return await WhatsAppStickers.getAuthority();
    }
    return "com.transsticker.app.stickercontentprovider";
  }

  /**
   * List created packs
   */
  async listPacks() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.packDir);
      if (!dirInfo.exists) {
        return [];
      }

      const packDirs = await FileSystem.readDirectoryAsync(this.packDir);
      const packs = [];

      for (const packId of packDirs) {
        const metadataPath = this.packDir + packId + "/metadata.json";
        const metadataInfo = await FileSystem.getInfoAsync(metadataPath);

        if (metadataInfo.exists) {
          const metadataStr = await FileSystem.readAsStringAsync(metadataPath);
          packs.push(JSON.parse(metadataStr));
        }
      }

      return packs;
    } catch (error) {
      console.error("Error listing packs:", error);
      return [];
    }
  }

  /**
   * Delete a pack
   */
  async deletePack(packIdentifier) {
    const packPath = this.packDir + packIdentifier + "/";
    await FileSystem.deleteAsync(packPath, { idempotent: true });

    // Clear from native module
    if (this.isNativeModuleAvailable()) {
      // Note: Current implementation clears all packs
      // A more sophisticated version would remove just this pack
    }
  }

  /**
   * Clear all sticker packs from native cache
   */
  async clearAllPacks() {
    if (this.isNativeModuleAvailable()) {
      await WhatsAppStickers.clearStickerPacks();
    }

    // Also delete local files
    const dirInfo = await FileSystem.getInfoAsync(this.packDir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(this.packDir, { idempotent: true });
    }
  }

  /**
   * Show integration status
   */
  showIntegrationStatus() {
    if (this.isNativeModuleAvailable()) {
      Alert.alert(
        "Native Module Active",
        "WhatsApp Stickers native integration is active. You can add full sticker packs to WhatsApp.",
        [{ text: "OK" }]
      );
    } else {
      Alert.alert(
        "Native Module Not Available",
        "The app is running in Expo Go which doesn't support native modules. " +
          "Build a development build with 'npx expo run:android' or use EAS Build " +
          "to enable full WhatsApp sticker pack integration.",
        [{ text: "OK" }]
      );
    }
  }
}
