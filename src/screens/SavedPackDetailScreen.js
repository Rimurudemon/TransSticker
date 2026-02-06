import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useStickers } from "../context/StickerContext";
import StickerConverter from "../utils/StickerConverter";
import AnimatedSticker from "../components/AnimatedSticker";

// WhatsApp sticker pack constraints
const WHATSAPP_MIN_STICKERS = 3;
const WHATSAPP_MAX_STICKERS = 30;

export default function SavedPackDetailScreen({ route, navigation }) {
  const { pack } = route.params;
  const { savePack } = useStickers();
  const [selectedStickers, setSelectedStickers] = useState(
    pack.stickers?.map((s) => s.file_id || s.file_unique_id) || [],
  );

  // Calculate validation state based on selected stickers
  const validationState = useMemo(() => {
    const selectedStickerData =
      pack.stickers?.filter((s) =>
        selectedStickers.includes(s.file_id || s.file_unique_id),
      ) || [];

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

  const toggleSticker = (stickerId) => {
    setSelectedStickers((prev) => {
      if (prev.includes(stickerId)) {
        return prev.filter((id) => id !== stickerId);
      } else {
        return [...prev, stickerId];
      }
    });
  };

  const selectAll = () => {
    setSelectedStickers(
      pack.stickers?.map((s) => s.file_id || s.file_unique_id) || [],
    );
  };

  const deselectAll = () => {
    setSelectedStickers([]);
  };

  const exportSelected = async () => {
    if (selectedStickers.length === 0) {
      Alert.alert(
        "No Stickers Selected",
        "Please select at least one sticker to export.",
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

    // Proceed with normal export
    await proceedWithExport();
  };

  // Matrix-style Red Pill / Blue Pill choice
  const showMatrixChoice = () => {
    const count = validationState.count;
    const needed = WHATSAPP_MIN_STICKERS - count;

    const duplicateMessage =
      count === 1
        ? "I will duplicate this sticker twice to create a pack of 3 identical stickers."
        : "I will duplicate one of your stickers to create a pack of 3 stickers.";

    Alert.alert(
      "🔴 Red Pill or 🔵 Blue Pill? 💊",
      `You have selected only ${count} sticker${count > 1 ? "s" : ""}. WhatsApp requires at least 3 stickers per pack.\n\n` +
        `Choose your path:\n\n` +
        `🔴 RED PILL: Face reality - go back and select ${needed} more sticker${needed > 1 ? "s" : ""} from this pack.\n\n` +
        `🔵 BLUE PILL: Stay in the Matrix - ${duplicateMessage}`,
      [
        {
          text: "🔴 Red Pill",
          style: "cancel",
          onPress: () => {
            // Just close the dialog, user can select more
          },
        },
        {
          text: "🔵 Blue Pill",
          onPress: () => duplicateAndExport(),
        },
      ],
    );
  };

  // Duplicate stickers to meet minimum requirement
  const duplicateAndExport = async () => {
    try {
      const selectedStickerData = pack.stickers.filter((s) =>
        selectedStickers.includes(s.file_id || s.file_unique_id),
      );

      const count = selectedStickerData.length;
      const duplicatesNeeded = WHATSAPP_MIN_STICKERS - count;

      // Create duplicates
      const duplicatedStickers = [...selectedStickerData];

      for (let i = 0; i < duplicatesNeeded; i++) {
        // Pick sticker to duplicate (cycle through existing ones)
        const sourceStickerIndex = i % count;
        const sourceSticker = selectedStickerData[sourceStickerIndex];

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
          file_id: `${sourceSticker.file_id || sourceSticker.file_unique_id}_dup_${i}`,
          file_unique_id: `${sourceSticker.file_unique_id}_dup_${i}`,
          localPath: newPath,
          isDuplicate: true,
        };

        duplicatedStickers.push(duplicateSticker);
      }

      // Show info about what we did
      const duplicateInfo =
        count === 1
          ? "Duplicated your sticker twice"
          : `Duplicated ${duplicatesNeeded} sticker${duplicatesNeeded > 1 ? "s" : ""}`;

      Alert.alert(
        "🔵 Blue Pill Taken!",
        `${duplicateInfo} to meet the minimum requirement.\n\nYou now have ${duplicatedStickers.length} stickers ready to export.`,
        [
          {
            text: "Continue to Export",
            onPress: () => proceedWithExportData(duplicatedStickers),
          },
        ],
      );
    } catch (error) {
      console.error("Error duplicating stickers:", error);
      Alert.alert(
        "Duplication Failed",
        "Failed to duplicate stickers. Please try selecting more stickers instead.",
      );
    }
  };

  // Proceed with export using selected sticker data
  const proceedWithExport = async () => {
    const selectedStickerData = pack.stickers.filter((s) =>
      selectedStickers.includes(s.file_id || s.file_unique_id),
    );
    await proceedWithExportData(selectedStickerData);
  };

  // Export with the given sticker data
  const proceedWithExportData = async (stickerData) => {
    // Check if we're exporting all stickers (no need to create a new pack)
    const isFullExport =
      stickerData.length === pack.stickers.length &&
      !stickerData.some((s) => s.isDuplicate);

    if (isFullExport) {
      // Export the original pack directly
      navigation.navigate("WhatsAppExport", { pack });
      return;
    }

    // Create subset pack(s) for partial export
    try {
      const converter = new StickerConverter();

      // Check if we need to split into multiple packs
      const needsSplit = stickerData.length > WHATSAPP_MAX_STICKERS;

      if (needsSplit) {
        // Split stickers into multiple packs
        const numPacks = Math.ceil(stickerData.length / WHATSAPP_MAX_STICKERS);
        const savedPacks = [];

        for (let packIndex = 0; packIndex < numPacks; packIndex++) {
          const startIdx = packIndex * WHATSAPP_MAX_STICKERS;
          const endIdx = Math.min(
            startIdx + WHATSAPP_MAX_STICKERS,
            stickerData.length,
          );
          const packStickers = stickerData.slice(startIdx, endIdx);

          // Create tray icon from first sticker of this sub-pack
          const trayIconPath = await converter.createTrayIcon(
            packStickers[0].localPath,
          );

          // Save the sub-pack with a numbered suffix
          const packSuffix = ` (Selection Part ${packIndex + 1})`;
          const savedPack = await savePack({
            name: `${pack.name}_selection_part${packIndex + 1}`,
            title: `${pack.title}${packSuffix}`,
            stickers: packStickers,
            trayIcon: trayIconPath,
            source: "telegram",
            originalPackName: pack.name,
            isAnimated: pack.isAnimated || pack.is_animated || pack.is_video,
            is_animated: pack.is_animated,
            is_video: pack.is_video,
          });

          savedPacks.push(savedPack);
        }

        Alert.alert(
          "Subset Packs Created!",
          `Created ${savedPacks.length} packs from your selection (max ${WHATSAPP_MAX_STICKERS} per pack).\n\nReady to export to WhatsApp!`,
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
              onPress: () => navigation.navigate("SavedMain"),
            },
          ],
        );
      } else {
        // Single subset pack
        const trayIconPath = await converter.createTrayIcon(
          stickerData[0].localPath,
        );

        // Create a temporary pack object for export (no need to save it)
        const subsetPack = {
          id: `${pack.id}_subset_${Date.now()}`,
          name: `${pack.name}_selection`,
          title: `${pack.title} (Selection)`,
          stickers: stickerData,
          trayIcon: trayIconPath,
          source: pack.source,
          originalPackName: pack.name,
          isAnimated: pack.isAnimated || pack.is_animated || pack.is_video,
          is_animated: pack.is_animated,
          is_video: pack.is_video,
          savedAt: new Date().toISOString(),
        };

        // Navigate directly to export - no need to save since stickers are already local
        navigation.navigate("WhatsAppExport", { pack: subsetPack });
      }
    } catch (error) {
      console.error("Error creating subset pack:", error);
      Alert.alert(
        "Export Failed",
        error.message ||
          "Failed to prepare stickers for export. Please try again.",
      );
    }
  };

  const renderSticker = ({ item, index }) => {
    const stickerId = item.file_id || item.file_unique_id;
    const isSelected = selectedStickers.includes(stickerId);

    return (
      <TouchableOpacity
        style={[styles.stickerItem, isSelected && styles.stickerSelected]}
        onPress={() => toggleSticker(stickerId)}
      >
        <AnimatedSticker
          sticker={{
            ...item,
            is_animated: pack.is_animated || item.is_animated,
            is_video: pack.is_video || item.is_video,
          }}
          style={styles.stickerImage}
          resizeMode="contain"
          playing={true}
          source="local"
        />
        <View style={styles.checkboxContainer}>
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </View>
        <Text style={styles.stickerNumber}>{index + 1}</Text>
      </TouchableOpacity>
    );
  };

  const warnings = getWarnings();
  const allSelected = selectedStickers.length === pack.stickers?.length;

  return (
    <View style={styles.container}>
      {/* Pack Info Header */}
      <View style={styles.header}>
        <Text style={styles.packTitle}>{pack.title}</Text>
        <Text style={styles.packInfo}>
          {pack.stickers?.length || 0} stickers •{" "}
          {pack.is_animated || pack.is_video ? "Animated" : "Static"} • Already
          saved locally ✅
        </Text>
      </View>

      {/* Selection Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            allSelected && styles.controlButtonActive,
          ]}
          onPress={allSelected ? deselectAll : selectAll}
        >
          <Text style={styles.controlButtonText}>
            {allSelected ? "Deselect All" : "Select All"}
          </Text>
        </TouchableOpacity>
        <View style={styles.selectionInfo}>
          <Text style={styles.selectionText}>
            {validationState.count} / {pack.stickers?.length} selected
          </Text>
        </View>
      </View>

      {/* Warnings */}
      {warnings.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.warningsContainer}
        >
          {warnings.map((warning, index) => (
            <View
              key={index}
              style={[
                styles.warningCard,
                warning.type === "error"
                  ? styles.warningError
                  : styles.warningInfo,
              ]}
            >
              <Text style={styles.warningIcon}>{warning.icon}</Text>
              <View style={styles.warningTextContainer}>
                <Text style={styles.warningTitle}>{warning.title}</Text>
                <Text style={styles.warningMessage} numberOfLines={2}>
                  {warning.message}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Sticker Grid */}
      <FlatList
        data={pack.stickers}
        renderItem={renderSticker}
        keyExtractor={(item, index) =>
          item.file_id || item.file_unique_id || index.toString()
        }
        numColumns={4}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      {/* Export Button */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerNote}>
            💡 No download needed - stickers are already on your device!
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.exportButton,
            !validationState.isValid && styles.exportButtonDisabled,
          ]}
          onPress={exportSelected}
          disabled={!validationState.isValid}
        >
          <Text style={styles.exportButtonText}>
            {validationState.count === pack.stickers?.length
              ? "Export All to WhatsApp"
              : `Export ${validationState.count} Selected`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2d2d44",
  },
  packTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  packInfo: {
    color: "#25D366",
    fontSize: 14,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2d2d44",
  },
  controlButton: {
    backgroundColor: "#2d2d44",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  controlButtonActive: {
    backgroundColor: "#6C63FF",
  },
  controlButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  selectionInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectionText: {
    color: "#6C63FF",
    fontSize: 16,
    fontWeight: "bold",
  },
  warningsContainer: {
    maxHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
    maxWidth: 300,
  },
  warningError: {
    backgroundColor: "#3d1f1f",
  },
  warningInfo: {
    backgroundColor: "#1f2d3d",
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  warningMessage: {
    color: "#aaa",
    fontSize: 11,
  },
  grid: {
    padding: 8,
  },
  stickerItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 4,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 8,
    position: "relative",
    borderWidth: 2,
    borderColor: "transparent",
  },
  stickerSelected: {
    borderColor: "#6C63FF",
    backgroundColor: "#252540",
  },
  stickerImage: {
    flex: 1,
    borderRadius: 4,
  },
  checkboxContainer: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#6C63FF",
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#6C63FF",
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  stickerNumber: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "#fff",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#2d2d44",
  },
  footerInfo: {
    marginBottom: 12,
  },
  footerNote: {
    color: "#25D366",
    fontSize: 12,
    textAlign: "center",
  },
  exportButton: {
    backgroundColor: "#25D366",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  exportButtonDisabled: {
    backgroundColor: "#2d2d44",
    opacity: 0.7,
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
