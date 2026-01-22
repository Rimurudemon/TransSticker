import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useStickers } from "../context/StickerContext";
import TelegramService from "../services/TelegramService";
import StickerConverter from "../utils/StickerConverter";
import AnimatedSticker from "../components/AnimatedSticker";

// WhatsApp sticker pack constraints
const WHATSAPP_MIN_STICKERS = 3;
const WHATSAPP_MAX_STICKERS = 30;

export default function StickerPackDetailScreen({ route, navigation }) {
  const { pack } = route.params;
  const { telegramBotToken, savePack } = useStickers();
  const [selectedStickers, setSelectedStickers] = useState(
    pack.stickers?.map((s) => s.file_id) || [],
  );
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Calculate validation state based on selected stickers
  const validationState = useMemo(() => {
    const selectedStickerData = pack.stickers?.filter((s) =>
      selectedStickers.includes(s.file_id)
    ) || [];

    const count = selectedStickerData.length;

    // Check for static vs animated mix
    let staticCount = 0;
    let animatedCount = 0;

    selectedStickerData.forEach((sticker) => {
      const isAnimated = pack.is_animated || pack.is_video || sticker.is_animated || sticker.is_video;
      if (isAnimated) {
        animatedCount++;
      } else {
        staticCount++;
      }
    });

    const hasMixedTypes = staticCount > 0 && animatedCount > 0;
    const isBelowMinimum = count > 0 && count < WHATSAPP_MIN_STICKERS;
    const isAboveMaximum = count > WHATSAPP_MAX_STICKERS;
    const needsSplitting = count > WHATSAPP_MAX_STICKERS && !hasMixedTypes;

    // Calculate how packs would be split
    let packSplitInfo = null;
    if (needsSplitting) {
      const numPacks = Math.ceil(count / WHATSAPP_MAX_STICKERS);
      const packSizes = [];
      let remaining = count;
      for (let i = 0; i < numPacks; i++) {
        const size = Math.min(remaining, WHATSAPP_MAX_STICKERS);
        packSizes.push(size);
        remaining -= size;
      }
      packSplitInfo = { numPacks, packSizes };
    }

    return {
      count,
      staticCount,
      animatedCount,
      hasMixedTypes,
      isBelowMinimum,
      isAboveMaximum,
      needsSplitting,
      packSplitInfo,
      isValid: count >= WHATSAPP_MIN_STICKERS && !hasMixedTypes,
    };
  }, [selectedStickers, pack.stickers, pack.is_animated, pack.is_video]);

  // Get warning messages
  const getWarnings = () => {
    const warnings = [];

    if (validationState.isBelowMinimum) {
      warnings.push({
        type: "error",
        icon: "⚠️",
        title: "Too Few Stickers",
        message: `WhatsApp requires at least ${WHATSAPP_MIN_STICKERS} stickers per pack. You have selected ${validationState.count}. Please select ${WHATSAPP_MIN_STICKERS - validationState.count} more.`,
      });
    }

    if (validationState.hasMixedTypes) {
      warnings.push({
        type: "error",
        icon: "🚫",
        title: "Mixed Sticker Types",
        message: `WhatsApp packs cannot contain both static and animated stickers. You have ${validationState.staticCount} static and ${validationState.animatedCount} animated stickers selected. Please choose only one type.`,
      });
    }

    if (validationState.needsSplitting && validationState.packSplitInfo) {
      const { numPacks, packSizes } = validationState.packSplitInfo;
      warnings.push({
        type: "info",
        icon: "📦",
        title: "Multiple Packs Will Be Created",
        message: `You selected ${validationState.count} stickers (max ${WHATSAPP_MAX_STICKERS} per pack). This will create ${numPacks} packs with ${packSizes.join(", ")} stickers respectively.`,
      });
    }

    return warnings;
  };

  const toggleSticker = (fileId) => {
    setSelectedStickers((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      } else {
        return [...prev, fileId];
      }
    });
  };

  const selectAll = () => {
    setSelectedStickers(pack.stickers?.map((s) => s.file_id) || []);
  };

  const deselectAll = () => {
    setSelectedStickers([]);
  };

  const downloadAndSave = async () => {
    if (selectedStickers.length === 0) {
      Alert.alert(
        "No Stickers Selected",
        "Please select at least one sticker to download.",
      );
      return;
    }

    if (validationState.isBelowMinimum) {
      Alert.alert(
        "Minimum Stickers Required",
        `WhatsApp requires at least ${WHATSAPP_MIN_STICKERS} stickers per pack. Please select ${WHATSAPP_MIN_STICKERS - validationState.count} more stickers.`,
      );
      return;
    }

    if (validationState.hasMixedTypes) {
      Alert.alert(
        "Mixed Sticker Types Not Allowed",
        `WhatsApp packs cannot contain both static and animated stickers. You have ${validationState.staticCount} static and ${validationState.animatedCount} animated stickers selected. Please choose only one type.`,
      );
      return;
    }

    setDownloading(true);
    setProgress(0);

    try {
      const telegramService = new TelegramService(telegramBotToken);
      const converter = new StickerConverter();

      const selectedStickerData = pack.stickers.filter((s) =>
        selectedStickers.includes(s.file_id),
      );

      let downloadedStickers = [];
      let failedStickers = [];
      let hasAnimatedSticker = false;
      let hasVideoSticker = false;

      // Helper function to download a single sticker
      const downloadSingleSticker = async (sticker, index) => {
        try {
          // Download the sticker file
          const fileUrl = await telegramService.getFileUrl(sticker.file_id);

          // Check if this sticker is animated (TGS) or video
          const isAnimatedSticker = pack.is_animated || sticker.is_animated;
          const isVideoSticker = pack.is_video || sticker.is_video;

          if (isAnimatedSticker) hasAnimatedSticker = true;
          if (isVideoSticker) hasVideoSticker = true;

          // Determine extension based on sticker type
          let extension = "webp";
          if (isAnimatedSticker) extension = "tgs";
          else if (isVideoSticker) extension = "webm";

          console.log(
            `Sticker ${index}: isAnimated=${isAnimatedSticker}, isVideo=${isVideoSticker}, extension=${extension}`,
          );

          const localPath = await telegramService.downloadFile(
            fileUrl,
            `${pack.name}_${sticker.file_unique_id}.${extension}`,
          );

          console.log(`Downloaded sticker to: ${localPath}`);

          // Convert to WhatsApp format
          const convertedPath = await converter.convertToWhatsAppFormat(
            localPath,
            isAnimatedSticker || isVideoSticker,
          );
          console.log(`Converted sticker to: ${convertedPath}`);

          return {
            success: true,
            sticker: {
              ...sticker,
              localPath: convertedPath,
              originalPath: localPath,
            },
          };
        } catch (err) {
          console.error(`Failed sticker ${index}:`, err);
          return {
            success: false,
            sticker,
            error: err.message || "Unknown error",
          };
        }
      };

      // First pass - download all stickers
      for (let i = 0; i < selectedStickerData.length; i++) {
        const sticker = selectedStickerData[i];
        setProgress(Math.round(((i + 1) / selectedStickerData.length) * 100));

        const result = await downloadSingleSticker(sticker, i);
        if (result.success) {
          downloadedStickers.push(result.sticker);
        } else {
          failedStickers.push({ sticker: result.sticker, error: result.error, index: i });
        }
      }

      // If there are failed stickers, ask user if they want to retry
      const retryFailedStickers = async (failed, retryCount = 1) => {
        return new Promise((resolve) => {
          const failedCount = failed.length;
          const failedInfo = failed.slice(0, 3).map(f => 
            `• Sticker ${f.index + 1}: ${f.error}`
          ).join("\n");
          const moreText = failedCount > 3 ? `\n• ...and ${failedCount - 3} more` : "";

          Alert.alert(
            `${failedCount} Sticker${failedCount > 1 ? "s" : ""} Failed`,
            `The following stickers failed to download/convert:\n\n${failedInfo}${moreText}\n\nWould you like to retry? (Attempt ${retryCount}/3)`,
            [
              {
                text: "Skip Failed",
                style: "cancel",
                onPress: () => resolve({ retry: false, stickers: [] }),
              },
              {
                text: "Retry Failed",
                onPress: async () => {
                  const retryResults = [];
                  for (let i = 0; i < failed.length; i++) {
                    setProgress(Math.round(((i + 1) / failed.length) * 100));
                    const result = await downloadSingleSticker(failed[i].sticker, failed[i].index);
                    retryResults.push(result);
                  }
                  resolve({ retry: true, results: retryResults });
                },
              },
            ],
          );
        });
      };

      // Retry loop (max 2 retries)
      let retryCount = 1;
      while (failedStickers.length > 0 && retryCount <= 2) {
        const retryResponse = await retryFailedStickers(failedStickers, retryCount);
        
        if (!retryResponse.retry) {
          break; // User chose to skip
        }

        // Process retry results
        const newFailed = [];
        for (const result of retryResponse.results) {
          if (result.success) {
            downloadedStickers.push(result.sticker);
          } else {
            const originalFailed = failedStickers.find(f => f.sticker.file_id === result.sticker.file_id);
            newFailed.push({ 
              sticker: result.sticker, 
              error: result.error, 
              index: originalFailed?.index || 0 
            });
          }
        }
        
        failedStickers = newFailed;
        retryCount++;
      }

      // Final summary if there are still failed stickers
      if (failedStickers.length > 0) {
        Alert.alert(
          "Some Stickers Skipped",
          `${failedStickers.length} sticker${failedStickers.length > 1 ? "s" : ""} could not be downloaded and will be skipped.`,
          [{ text: "OK" }],
        );
      }

      if (downloadedStickers.length === 0) {
        throw new Error("Failed to download or convert any stickers");
      }

      // Check if we need to split into multiple packs
      const needsSplit = downloadedStickers.length > WHATSAPP_MAX_STICKERS;
      const savedPacks = [];

      if (needsSplit) {
        // Split stickers into multiple packs
        const numPacks = Math.ceil(downloadedStickers.length / WHATSAPP_MAX_STICKERS);
        
        for (let packIndex = 0; packIndex < numPacks; packIndex++) {
          const startIdx = packIndex * WHATSAPP_MAX_STICKERS;
          const endIdx = Math.min(startIdx + WHATSAPP_MAX_STICKERS, downloadedStickers.length);
          const packStickers = downloadedStickers.slice(startIdx, endIdx);

          // Create tray icon from first sticker of this sub-pack
          const trayIconPath = await converter.createTrayIcon(
            packStickers[0].localPath,
          );

          // Save the sub-pack with a numbered suffix
          const packSuffix = numPacks > 1 ? ` (Part ${packIndex + 1})` : "";
          const savedPack = await savePack({
            name: `${pack.name}_part${packIndex + 1}`,
            title: `${pack.title}${packSuffix}`,
            stickers: packStickers,
            trayIcon: trayIconPath,
            source: "telegram",
            originalPackName: pack.name,
            isAnimated: hasAnimatedSticker || hasVideoSticker,
            is_animated: hasAnimatedSticker,
            is_video: hasVideoSticker,
          });

          savedPacks.push(savedPack);
        }

        Alert.alert(
          "Packs Saved!",
          `Successfully downloaded ${downloadedStickers.length} stickers and split them into ${savedPacks.length} packs (max ${WHATSAPP_MAX_STICKERS} per pack).\n\nPack sizes: ${savedPacks.map(p => p.stickers.length).join(", ")} stickers.\n\nReady to export to WhatsApp!`,
          [
            {
              text: "Export Now",
              onPress: () =>
                navigation.navigate("WhatsAppExport", { 
                  pack: savedPacks[0], 
                  allPacks: savedPacks,
                  currentPackIndex: 0
                }),
            },
            {
              text: "Later",
              onPress: () => navigation.navigate("Home"),
            },
          ],
        );
      } else {
        // Single pack case
        // Create tray icon from first sticker
        const trayIconPath = await converter.createTrayIcon(
          downloadedStickers[0].localPath,
        );

        // Save the pack
        const savedPack = await savePack({
          name: pack.name,
          title: pack.title,
          stickers: downloadedStickers,
          trayIcon: trayIconPath,
          source: "telegram",
          originalPackName: pack.name,
          isAnimated: hasAnimatedSticker || hasVideoSticker,
          is_animated: hasAnimatedSticker,
          is_video: hasVideoSticker,
        });

        Alert.alert(
          "Pack Saved!",
          `Successfully downloaded ${downloadedStickers.length} stickers. Ready to export to WhatsApp!`,
          [
            {
              text: "Export Now",
              onPress: () =>
                navigation.navigate("WhatsAppExport", { pack: savedPack }),
            },
            {
              text: "Later",
              onPress: () => navigation.navigate("Home"),
            },
          ],
        );
      }
    } catch (error) {
      console.error("Error downloading stickers:", error);
      Alert.alert(
        "Download Failed",
        error.message || "Failed to download stickers. Please try again.",
      );
    } finally {
      setDownloading(false);
    }
  };

  const renderSticker = ({ item }) => {
    const isSelected = selectedStickers.includes(item.file_id);
    const isAnimated = pack.is_animated || item.is_animated;
    const isVideo = pack.is_video || item.is_video;
    
    // Determine source: if localPath exists, it's a saved sticker; otherwise from Telegram
    const source = item.localPath ? "local" : "telegram";
    
    return (
      <TouchableOpacity
        style={[styles.stickerItem, isSelected && styles.stickerSelected]}
        onPress={() => toggleSticker(item.file_id)}
      >
        <AnimatedSticker
          sticker={{
            ...item,
            is_animated: isAnimated,
            is_video: isVideo,
          }}
          style={styles.stickerImage}
          resizeMode="contain"
          playing={true}
          source={source}
        />
        {(isAnimated || isVideo) && (
          <View style={styles.animatedIndicator}>
            <Text style={styles.animatedIndicatorText}>
              {isVideo ? "▶" : "◆"}
            </Text>
          </View>
        )}
        {isSelected && (
          <View style={styles.checkmark}>
            <Text style={styles.checkmarkText}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.packTitle} numberOfLines={1}>
            {pack.title}
          </Text>
          <Text style={styles.packSubtitle}>
            {selectedStickers.length} of {pack.stickers?.length || 0} selected
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={selectAll}>
            <Text style={styles.headerButtonText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={deselectAll}>
            <Text style={styles.headerButtonText}>None</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Warning Banners */}
      {getWarnings().length > 0 && (
        <View style={styles.warningsContainer}>
          {getWarnings().map((warning, index) => (
            <View
              key={index}
              style={[
                styles.warningBanner,
                warning.type === "error" ? styles.warningError : styles.warningInfo,
              ]}
            >
              <Text style={styles.warningIcon}>{warning.icon}</Text>
              <View style={styles.warningContent}>
                <Text style={[
                  styles.warningTitle,
                  warning.type === "error" ? styles.warningTitleError : styles.warningTitleInfo,
                ]}>
                  {warning.title}
                </Text>
                <Text style={styles.warningMessage}>{warning.message}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={pack.stickers || []}
        renderItem={renderSticker}
        keyExtractor={(item) => item.file_id}
        numColumns={4}
        contentContainerStyle={styles.stickerGrid}
        showsVerticalScrollIndicator={false}
      />

      {downloading ? (
        <View style={styles.downloadingContainer}>
          <ActivityIndicator color="#6C63FF" size="large" />
          <Text style={styles.downloadingText}>Downloading... {progress}%</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.downloadButton,
            !validationState.isValid && styles.downloadButtonDisabled,
          ]}
          onPress={downloadAndSave}
          disabled={!validationState.isValid}
        >
          <Text style={styles.downloadButtonText}>
            {validationState.needsSplitting
              ? `Download & Save (${validationState.count} stickers → ${validationState.packSplitInfo?.numPacks} packs)`
              : `Download & Save (${selectedStickers.length} stickers)`}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.noteText}>
        * WhatsApp: min {WHATSAPP_MIN_STICKERS}, max {WHATSAPP_MAX_STICKERS} stickers • No mixing static/animated
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#1a1a2e",
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  packTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  packSubtitle: {
    color: "#888",
    fontSize: 14,
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  headerButton: {
    backgroundColor: "#2d2d44",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerButtonText: {
    color: "#6C63FF",
    fontSize: 14,
    fontWeight: "600",
  },
  stickerGrid: {
    padding: 8,
    paddingBottom: 100,
  },
  stickerItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 4,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  stickerSelected: {
    borderColor: "#6C63FF",
    backgroundColor: "#252540",
  },
  stickerImage: {
    width: "100%",
    height: "100%",
  },
  checkmark: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#6C63FF",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  downloadingContainer: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "#1a1a2e",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  downloadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: "#2d2d44",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#6C63FF",
  },
  downloadButton: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "#6C63FF",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  downloadButtonDisabled: {
    backgroundColor: "#3d3d5c",
    opacity: 0.6,
  },
  downloadButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  noteText: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#666",
    fontSize: 12,
  },
  animatedIndicator: {
    position: "absolute",
    bottom: 4,
    left: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  animatedIndicatorText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "bold",
  },
  // Warning banner styles
  warningsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warningBanner: {
    flexDirection: "row",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: "flex-start",
  },
  warningError: {
    backgroundColor: "rgba(255, 82, 82, 0.15)",
    borderLeftWidth: 4,
    borderLeftColor: "#FF5252",
  },
  warningInfo: {
    backgroundColor: "rgba(108, 99, 255, 0.15)",
    borderLeftWidth: 4,
    borderLeftColor: "#6C63FF",
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  warningTitleError: {
    color: "#FF5252",
  },
  warningTitleInfo: {
    color: "#6C63FF",
  },
  warningMessage: {
    color: "#aaa",
    fontSize: 12,
    lineHeight: 18,
  },
});
