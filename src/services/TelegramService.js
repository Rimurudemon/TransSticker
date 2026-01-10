import axios from "axios";
import * as FileSystem from "expo-file-system/legacy";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export default class TelegramService {
  constructor(botToken) {
    this.botToken = botToken;
    this.apiBase = `${TELEGRAM_API_BASE}/bot${botToken}`;
    this.fileBase = `${TELEGRAM_API_BASE}/file/bot${botToken}`;
    this.cacheDir = FileSystem.documentDirectory + "transsticker/cache/";
  }

  /**
   * Initialize the cache directory
   */
  async initCache() {
    const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.cacheDir, {
        intermediates: true,
      });
    }
  }

  /**
   * Make an API request to Telegram Bot API
   */
  async apiRequest(method, params = {}) {
    try {
      const response = await axios.get(`${this.apiBase}/${method}`, { params });

      if (!response.data.ok) {
        throw new Error(response.data.description || "API request failed");
      }

      return response.data.result;
    } catch (error) {
      if (error.response?.data?.description) {
        throw new Error(error.response.data.description);
      }
      throw error;
    }
  }

  /**
   * Get sticker pack by name
   */
  async getStickerPack(packName) {
    const result = await this.apiRequest("getStickerSet", { name: packName });

    // Process stickers to get thumbnail URLs
    const stickersWithThumbnails = await Promise.all(
      result.stickers.map(async (sticker) => {
        let thumbnailUrl = null;

        // Try to get thumbnail
        if (sticker.thumbnail) {
          try {
            thumbnailUrl = await this.getFileUrl(sticker.thumbnail.file_id);
          } catch (err) {
            console.warn("Failed to get thumbnail:", err);
          }
        }

        // If no thumbnail, try the sticker file itself
        if (!thumbnailUrl) {
          try {
            thumbnailUrl = await this.getFileUrl(sticker.file_id);
          } catch (err) {
            console.warn("Failed to get sticker URL:", err);
          }
        }

        return {
          ...sticker,
          thumbnail: thumbnailUrl,
          file_url: thumbnailUrl,
        };
      })
    );

    return {
      name: result.name,
      title: result.title,
      sticker_type: result.sticker_type,
      is_animated: result.is_animated,
      is_video: result.is_video,
      stickers: stickersWithThumbnails,
    };
  }

  /**
   * Get file URL from file_id
   */
  async getFileUrl(fileId) {
    const file = await this.apiRequest("getFile", { file_id: fileId });
    return `${this.fileBase}/${file.file_path}`;
  }

  /**
   * Download a file to local storage
   */
  async downloadFile(fileUrl, filename) {
    await this.initCache();

    const localPath = this.cacheDir + filename;

    // Check if file already exists
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      return localPath;
    }

    // Download the file
    const downloadResult = await FileSystem.downloadAsync(fileUrl, localPath);

    if (downloadResult.status !== 200) {
      throw new Error(`Failed to download file: ${downloadResult.status}`);
    }

    return downloadResult.uri;
  }

  /**
   * Download all stickers from a pack
   */
  async downloadPack(pack, onProgress) {
    const downloadedStickers = [];
    const total = pack.stickers.length;

    for (let i = 0; i < total; i++) {
      const sticker = pack.stickers[i];

      try {
        const fileUrl = await this.getFileUrl(sticker.file_id);
        const filename = `${pack.name}_${i}_${sticker.file_unique_id}.webp`;
        const localPath = await this.downloadFile(fileUrl, filename);

        downloadedStickers.push({
          ...sticker,
          localPath,
        });
      } catch (error) {
        console.error(`Failed to download sticker ${i}:`, error);
      }

      if (onProgress) {
        onProgress((i + 1) / total);
      }
    }

    return downloadedStickers;
  }

  /**
   * Search for sticker packs (note: Telegram API doesn't have a direct search)
   * This would require a custom backend or scraping
   */
  async searchPacks(query) {
    // Telegram Bot API doesn't support searching for sticker packs
    // You would need to implement this with a custom backend
    // that maintains a database of sticker packs
    throw new Error(
      "Sticker pack search is not available via Bot API. Please enter the exact pack name."
    );
  }

  /**
   * Clear the cache
   */
  async clearCache() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(this.cacheDir, { idempotent: true });
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  }

  /**
   * Get cache size
   */
  async getCacheSize() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.cacheDir);
      if (!dirInfo.exists) {
        return 0;
      }

      const files = await FileSystem.readDirectoryAsync(this.cacheDir);
      let totalSize = 0;

      for (const file of files) {
        const fileInfo = await FileSystem.getInfoAsync(this.cacheDir + file);
        if (fileInfo.exists && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error("Failed to get cache size:", error);
      return 0;
    }
  }
}
