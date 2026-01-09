/**
 * WhatsApp Sticker Integration Service
 *
 * Note: Full WhatsApp Sticker pack integration requires native Android modules.
 * This service provides the interface and documentation for implementing
 * the WhatsApp Stickers SDK integration.
 *
 * For full integration, you need to:
 * 1. Add the WhatsApp Stickers SDK to android/app/build.gradle
 * 2. Create a ContentProvider for sticker packs
 * 3. Implement the native module bridge
 */

import { NativeModules, Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system";

// This would be the native module interface
// const { WhatsAppStickersModule } = NativeModules;

export default class WhatsAppService {
  constructor() {
    this.packDir =
      FileSystem.documentDirectory + "transsticker/whatsapp_packs/";
  }

  /**
   * Check if WhatsApp is installed
   */
  async isWhatsAppInstalled() {
    try {
      const canOpen = await Linking.canOpenURL("whatsapp://");
      return canOpen;
    } catch (error) {
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
   * Create a sticker pack for WhatsApp
   *
   * Pack requirements:
   * - Identifier: Unique string
   * - Name: Display name (max 128 chars)
   * - Publisher: Publisher name (max 128 chars)
   * - Tray image: 96x96 PNG
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

    // Copy tray image
    const trayDestPath = packPath + "tray.png";
    await FileSystem.copyAsync({
      from: trayImagePath,
      to: trayDestPath,
    });

    // Copy stickers
    const stickerPaths = [];
    for (let i = 0; i < stickers.length; i++) {
      const sticker = stickers[i];
      const stickerDestPath = packPath + `sticker_${i}.webp`;
      await FileSystem.copyAsync({
        from: sticker.localPath,
        to: stickerDestPath,
      });
      stickerPaths.push(stickerDestPath);
    }

    // Create pack metadata
    const packMetadata = {
      identifier,
      name,
      publisher,
      trayImageFile: trayDestPath,
      publisherEmail: publisherEmail || "",
      publisherWebsite: publisherWebsite || "",
      privacyPolicyWebsite: privacyPolicyWebsite || "",
      licenseAgreementWebsite: licenseAgreementWebsite || "",
      stickers: stickerPaths.map((path, index) => ({
        imageFile: path,
        emojis: stickers[index].emojis || ["😀"],
      })),
    };

    // Save metadata
    const metadataPath = packPath + "metadata.json";
    await FileSystem.writeAsStringAsync(
      metadataPath,
      JSON.stringify(packMetadata, null, 2)
    );

    return packMetadata;
  }

  /**
   * Add sticker pack to WhatsApp
   *
   * This requires native module implementation.
   * For Expo managed workflow, you may need to use expo-dev-client
   * or eject to bare workflow.
   */
  async addPackToWhatsApp(packIdentifier) {
    // Check if native module is available
    if (Platform.OS !== "android") {
      throw new Error("WhatsApp sticker packs are only supported on Android");
    }

    const isInstalled = await this.isWhatsAppInstalled();
    if (!isInstalled) {
      throw new Error("WhatsApp is not installed");
    }

    // Native module call would go here
    // if (WhatsAppStickersModule) {
    //   return await WhatsAppStickersModule.addStickerPack(packIdentifier);
    // }

    throw new Error(
      "Native WhatsApp Stickers module not available. " +
        "Please see the README for integration instructions."
    );
  }

  /**
   * Get integration instructions
   */
  getIntegrationInstructions() {
    return `
WhatsApp Stickers SDK Integration Guide
========================================

To fully integrate WhatsApp sticker packs, you need to add native Android code:

1. Add the WhatsApp Stickers SDK dependency to android/app/build.gradle:
   implementation 'com.whatsapp:stickers:1.0.0'

2. Create a ContentProvider class that extends StickerContentProvider

3. Register the ContentProvider in AndroidManifest.xml

4. Create a native module to bridge React Native with the SDK

5. Use expo-dev-client for development with native modules

For detailed instructions, see:
- WhatsApp Stickers GitHub: https://github.com/nicksay/whatsapp-stickers
- Expo Custom Development Builds: https://docs.expo.dev/development/introduction/

Alternative: Use the share functionality to share individual stickers,
which doesn't require native SDK integration.
    `;
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
  }
}
