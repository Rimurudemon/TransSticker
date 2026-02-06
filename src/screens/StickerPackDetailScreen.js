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
import * as FileSystem from "expo-file-system/legacy";
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
  const [downloadPhase, setDownloadPhase] = useState(""); // "downloading", "converting", "retrying"

  // Calculate validation state based on selected stickers
  const validationState = useMemo(() => {
    const selectedStickerData =
      pack.stickers?.filter((s) => selectedStickers.includes(s.file_id)) || [];

    const count = selectedStickerData.length;

    // Check for static vs animated mix
    let staticCount = 0;
    let animatedCount = 0;

    selectedStickerData.forEach((sticker) => {
      const isAnimated =
        pack.is_animated ||
        pack.is_video ||
        sticker.is_animated ||
        sticker.is_video;
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
      // isValid: true if we have stickers and no mixed types (allows 1-2 stickers for Matrix choice)
      isValid: count > 0 && !hasMixedTypes,
      // canExportDirectly: true only if we meet WhatsApp minimum
      canExportDirectly: count >= WHATSAPP_MIN_STICKERS && !hasMixedTypes,
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

  // Parallel processing configuration
  const PARALLEL_CONCURRENCY = 4; // Number of stickers to process in parallel

  /**
   * Process items in parallel with controlled concurrency
   * @param {Array} items - Array of items to process
   * @param {Function} processor - Async function to process each item
   * @param {number} concurrency - Max parallel operations
   * @param {Function} onProgress - Progress callback
   */
  const processInParallel = async (
    items,
    processor,
    concurrency,
    onProgress,
  ) => {
    const results = [];
    let completed = 0;
    const total = items.length;

    for (let i = 0; i < total; i += concurrency) {
      const chunk = items.slice(i, Math.min(i + concurrency, total));

      const chunkPromises = chunk.map((item, chunkIndex) =>
        processor(item, i + chunkIndex),
      );

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);

      completed += chunk.length;
      if (onProgress) {
        onProgress(Math.round((completed / total) * 100));
      }
    }

    return results;
  };

  const downloadAndSave = async () => {
    if (selectedStickers.length === 0) {
      Alert.alert(
        "No Stickers Selected",
        "Please select at least one sticker to download.",
      );
      return;
    }

    // Matrix-style choice for insufficient stickers
    if (validationState.isBelowMinimum) {
      showMatrixChoice();
      return;
    }

    if (validationState.hasMixedTypes) {
      Alert.alert(
        "Mixed Sticker Types Not Allowed",
        `WhatsApp packs cannot contain both static and animated stickers. You have ${validationState.staticCount} static and ${validationState.animatedCount} animated stickers selected. Please choose only one type.`,
      );
      return;
    }

    // Proceed with normal download
    await proceedWithDownload(false);
  };

  // Matrix-style Red Pill / Blue Pill choice
  const showMatrixChoice = () => {
    const count = validationState.count;
    const needed = WHATSAPP_MIN_STICKERS - count;

    const duplicateMessage =
      count === 1
        ? "I will download this sticker and duplicate it twice to create a pack of 3 identical stickers."
        : "I will download your stickers and duplicate one to create a pack of 3 stickers.";

    Alert.alert(
      "🔴 Red Pill or 🔵 Blue Pill? 💊",
      `You have selected only ${count} sticker${count > 1 ? "s" : ""}. WhatsApp requires at least 3 stickers per pack.\n\n` +
        `Choose your path:\n\n` +
        `🔴 RED PILL: Face reality - go back and select ${needed} more sticker${needed > 1 ? "s" : ""} from this pack.\n\n` +
        `🔵 BLUE PILL: Stay in the Matrix - ${duplicateMessage}`,
      [
        {
          text: "🔴 Select More",
          style: "cancel",
          onPress: () => {
            // Just close the dialog, user can select more
          },
        },
        {
          text: "🔵 Duplicate",
          onPress: () => proceedWithDownload(true),
        },
      ],
    );
  };

  // Proceed with download, optionally duplicating to meet minimum
  const proceedWithDownload = async (shouldDuplicate) => {
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

      // Track animated/video flags across all stickers
      selectedStickerData.forEach((sticker) => {
        if (pack.is_animated || sticker.is_animated) hasAnimatedSticker = true;
        if (pack.is_video || sticker.is_video) hasVideoSticker = true;
      });

      // Step 1: Download all stickers in parallel (fast network I/O)
      setDownloadPhase("Downloading stickers...");
      console.log(
        `Starting parallel download of ${selectedStickerData.length} stickers...`,
      );

      const downloadSingleFile = async (sticker, index) => {
        try {
          const fileUrl = await telegramService.getFileUrl(sticker.file_id);

          const isAnimatedSticker = pack.is_animated || sticker.is_animated;
          const isVideoSticker = pack.is_video || sticker.is_video;

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

          console.log(`Downloaded sticker ${index} to: ${localPath}`);

          return {
            success: true,
            sticker,
            localPath,
            isAnimated: isAnimatedSticker || isVideoSticker,
            index,
          };
        } catch (err) {
          console.error(`Failed to download sticker ${index}:`, err);
          return {
            success: false,
            sticker,
            error: err.message || "Download failed",
            index,
          };
        }
      };

      // Download files in parallel
      const downloadResults = await processInParallel(
        selectedStickerData,
        downloadSingleFile,
        PARALLEL_CONCURRENCY,
        (prog) => setProgress(Math.round(prog * 0.4)), // Downloads = 40% of progress
      );

      const successfulDownloads = downloadResults.filter((r) => r.success);
      const failedDownloads = downloadResults.filter((r) => !r.success);

      console.log(
        `Downloaded ${successfulDownloads.length}/${selectedStickerData.length} stickers`,
      );

      // Step 2: Convert stickers - use batch API for animated, parallel for static
      if (successfulDownloads.length > 0) {
        const animatedStickers = successfulDownloads.filter(
          (r) => r.isAnimated,
        );
        const staticStickers = successfulDownloads.filter((r) => !r.isAnimated);

        console.log(
          `Converting ${animatedStickers.length} animated + ${staticStickers.length} static stickers...`,
        );
        setDownloadPhase("Converting stickers...");

        // Convert animated stickers using batch API (sends multiple to server at once)
        if (animatedStickers.length > 0) {
          try {
            const animatedPaths = animatedStickers.map((r) => r.localPath);
            const batchResults = await converter.convertBatch(
              animatedPaths,
              (prog) => setProgress(40 + Math.round(prog * 40)), // Animated conversion = 40% of progress
              {
                isAnimated: true,
                useBatchApi: true,
                concurrency: PARALLEL_CONCURRENCY,
              },
            );

            batchResults.forEach((result, i) => {
              const originalData = animatedStickers[i];
              if (result.success) {
                downloadedStickers.push({
                  ...originalData.sticker,
                  localPath: result.converted,
                  originalPath: originalData.localPath,
                });
              } else {
                failedStickers.push({
                  sticker: originalData.sticker,
                  error: result.error,
                  index: originalData.index,
                });
              }
            });
          } catch (error) {
            console.error("Batch conversion failed:", error);
            // Fallback: add all animated as failed
            animatedStickers.forEach((r) => {
              failedStickers.push({
                sticker: r.sticker,
                error: error.message,
                index: r.index,
              });
            });
          }
        }

        // Convert static stickers in parallel locally
        if (staticStickers.length > 0) {
          const convertStatic = async (downloadResult) => {
            try {
              const convertedPath = await converter.convertToWhatsAppFormat(
                downloadResult.localPath,
                false, // static
              );
              return {
                success: true,
                sticker: {
                  ...downloadResult.sticker,
                  localPath: convertedPath,
                  originalPath: downloadResult.localPath,
                },
              };
            } catch (err) {
              return {
                success: false,
                sticker: downloadResult.sticker,
                error: err.message,
                index: downloadResult.index,
              };
            }
          };

          const staticResults = await processInParallel(
            staticStickers,
            convertStatic,
            PARALLEL_CONCURRENCY,
            (prog) => setProgress(80 + Math.round(prog * 15)), // Static conversion = 15% of progress
          );

          staticResults.forEach((result) => {
            if (result.success) {
              downloadedStickers.push(result.sticker);
            } else {
              failedStickers.push({
                sticker: result.sticker,
                error: result.error,
                index: result.index,
              });
            }
          });
        }
      }

      // Add download failures to failed list
      failedDownloads.forEach((r) => {
        failedStickers.push({
          sticker: r.sticker,
          error: r.error,
          index: r.index,
        });
      });

      setProgress(95);
      setDownloadPhase("Finalizing...");

      // If there are failed stickers, ask user if they want to retry
      const retryFailedStickers = async (failed, retryCount = 1) => {
        setDownloadPhase(`Retrying failed stickers (attempt ${retryCount})...`);
        return new Promise((resolve) => {
          const failedCount = failed.length;
          const failedInfo = failed
            .slice(0, 3)
            .map((f) => `• Sticker ${f.index + 1}: ${f.error}`)
            .join("\n");
          const moreText =
            failedCount > 3 ? `\n• ...and ${failedCount - 3} more` : "";

          Alert.alert(
            `${failedCount} Sticker${failedCount > 1 ? "s" : ""} Failed`,
            `The following stickers failed to download/convert:\n\n${failedInfo}${moreText}\n\nWould you like to retry? (Attempt ${retryCount}/3)`,
            [
              {
                text: "Skip Failed",
                style: "cancel",
                onPress: () => resolve({ retry: false, results: [] }),
              },
              {
                text: "Retry Failed",
                onPress: async () => {
                  // Retry download and convert in parallel
                  const retryProcessor = async (failedItem) => {
                    try {
                      const sticker = failedItem.sticker;
                      const fileUrl = await telegramService.getFileUrl(
                        sticker.file_id,
                      );

                      const isAnimatedSticker =
                        pack.is_animated || sticker.is_animated;
                      const isVideoSticker = pack.is_video || sticker.is_video;

                      let extension = "webp";
                      if (isAnimatedSticker) extension = "tgs";
                      else if (isVideoSticker) extension = "webm";

                      const localPath = await telegramService.downloadFile(
                        fileUrl,
                        `${pack.name}_${sticker.file_unique_id}.${extension}`,
                      );

                      const convertedPath =
                        await converter.convertToWhatsAppFormat(
                          localPath,
                          isAnimatedSticker || isVideoSticker,
                        );

                      return {
                        success: true,
                        sticker: {
                          ...sticker,
                          localPath: convertedPath,
                          originalPath: localPath,
                        },
                        index: failedItem.index,
                      };
                    } catch (err) {
                      return {
                        success: false,
                        sticker: failedItem.sticker,
                        error: err.message || "Retry failed",
                        index: failedItem.index,
                      };
                    }
                  };

                  const retryResults = await processInParallel(
                    failed,
                    retryProcessor,
                    PARALLEL_CONCURRENCY,
                    (prog) => setProgress(Math.round(prog * 100)),
                  );

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
        const retryResponse = await retryFailedStickers(
          failedStickers,
          retryCount,
        );

        if (!retryResponse.retry) {
          break; // User chose to skip
        }

        // Process retry results
        const newFailed = [];
        for (const result of retryResponse.results) {
          if (result.success) {
            downloadedStickers.push(result.sticker);
          } else {
            newFailed.push({
              sticker: result.sticker,
              error: result.error,
              index: result.index,
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

      // Handle duplication if user chose the Blue Pill
      if (
        shouldDuplicate &&
        downloadedStickers.length < WHATSAPP_MIN_STICKERS
      ) {
        const duplicatesNeeded =
          WHATSAPP_MIN_STICKERS - downloadedStickers.length;
        const originalCount = downloadedStickers.length;

        setDownloadPhase("🔵 Duplicating stickers...");

        for (let i = 0; i < duplicatesNeeded; i++) {
          // Pick sticker to duplicate (cycle through existing ones)
          const sourceStickerIndex = i % originalCount;
          const sourceSticker = downloadedStickers[sourceStickerIndex];

          // Create a copy of the file with a new name
          const timestamp = Date.now();
          const originalPath = sourceSticker.localPath;
          const extension = originalPath.split(".").pop();
          const newFilename = `duplicate_${timestamp}_${i}.${extension}`;
          const newPath =
            FileSystem.documentDirectory + `transsticker/${newFilename}`;

          await FileSystem.copyAsync({
            from: originalPath,
            to: newPath,
          });

          // Create duplicate sticker object
          const duplicateSticker = {
            ...sourceSticker,
            file_id: `${sourceSticker.file_id}_dup_${i}`,
            file_unique_id: `${sourceSticker.file_unique_id}_dup_${i}`,
            localPath: newPath,
            isDuplicate: true,
          };

          downloadedStickers.push(duplicateSticker);
        }

        console.log(
          `🔵 Blue Pill: Duplicated ${duplicatesNeeded} sticker(s) to meet minimum requirement`,
        );
      }

      // Check if we need to split into multiple packs
      const needsSplit = downloadedStickers.length > WHATSAPP_MAX_STICKERS;
      const savedPacks = [];

      if (needsSplit) {
        // Split stickers into multiple packs
        const numPacks = Math.ceil(
          downloadedStickers.length / WHATSAPP_MAX_STICKERS,
        );

        for (let packIndex = 0; packIndex < numPacks; packIndex++) {
          const startIdx = packIndex * WHATSAPP_MAX_STICKERS;
          const endIdx = Math.min(
            startIdx + WHATSAPP_MAX_STICKERS,
            downloadedStickers.length,
          );
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

        // Check if duplicates were added
        const duplicateCount = downloadedStickers.filter(
          (s) => s.isDuplicate,
        ).length;
        const duplicateNote =
          duplicateCount > 0
            ? `\n\n🔵 Blue Pill applied: ${duplicateCount} sticker${duplicateCount > 1 ? "s were" : " was"} duplicated.`
            : "";

        Alert.alert(
          "Packs Saved!",
          `Successfully downloaded ${downloadedStickers.length} stickers and split them into ${savedPacks.length} packs (max ${WHATSAPP_MAX_STICKERS} per pack).\n\nPack sizes: ${savedPacks.map((p) => p.stickers.length).join(", ")} stickers.${duplicateNote}\n\nReady to export to WhatsApp!`,
          [
            {
              text: "Export Now",
              onPress: () =>
                navigation.navigate("WhatsAppExport", {
                  pack: savedPacks[0],
                  allPacks: savedPacks,
                  currentPackIndex: 0,
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

        // Check if duplicates were added
        const duplicateCount = downloadedStickers.filter(
          (s) => s.isDuplicate,
        ).length;
        const duplicateNote =
          duplicateCount > 0
            ? `\n\n🔵 Blue Pill applied: ${duplicateCount} sticker${duplicateCount > 1 ? "s were" : " was"} duplicated to meet WhatsApp's minimum.`
            : "";

        Alert.alert(
          "Pack Saved!",
          `Successfully downloaded ${downloadedStickers.length} stickers.${duplicateNote}\n\nReady to export to WhatsApp!`,
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
                warning.type === "error"
                  ? styles.warningError
                  : styles.warningInfo,
              ]}
            >
              <Text style={styles.warningIcon}>{warning.icon}</Text>
              <View style={styles.warningContent}>
                <Text
                  style={[
                    styles.warningTitle,
                    warning.type === "error"
                      ? styles.warningTitleError
                      : styles.warningTitleInfo,
                  ]}
                >
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
          <Text style={styles.downloadingText}>
            {downloadPhase || "Processing..."} {progress}%
          </Text>
          <Text style={styles.parallelHint}>
            ⚡ Processing in parallel for faster results
          </Text>
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
        * WhatsApp: min {WHATSAPP_MIN_STICKERS}, max {WHATSAPP_MAX_STICKERS}{" "}
        stickers • No mixing static/animated
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
  parallelHint: {
    color: "#888",
    fontSize: 12,
    marginBottom: 10,
    fontStyle: "italic",
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
