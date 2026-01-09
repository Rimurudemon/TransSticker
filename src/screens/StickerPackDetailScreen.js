import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useStickers } from "../context/StickerContext";
import TelegramService from "../services/TelegramService";
import StickerConverter from "../utils/StickerConverter";

export default function StickerPackDetailScreen({ route, navigation }) {
  const { pack } = route.params;
  const { telegramBotToken, savePack } = useStickers();
  const [selectedStickers, setSelectedStickers] = useState(
    pack.stickers?.map((s) => s.file_id) || []
  );
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

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
        "Please select at least one sticker to download."
      );
      return;
    }

    if (selectedStickers.length < 3) {
      Alert.alert(
        "Minimum Stickers Required",
        "WhatsApp requires at least 3 stickers per pack. Please select more stickers."
      );
      return;
    }

    setDownloading(true);
    setProgress(0);

    try {
      const telegramService = new TelegramService(telegramBotToken);
      const converter = new StickerConverter();

      const selectedStickerData = pack.stickers.filter((s) =>
        selectedStickers.includes(s.file_id)
      );

      const downloadedStickers = [];
      for (let i = 0; i < selectedStickerData.length; i++) {
        const sticker = selectedStickerData[i];
        setProgress(Math.round(((i + 1) / selectedStickerData.length) * 100));

        try {
          // Download the sticker file
          const fileUrl = await telegramService.getFileUrl(sticker.file_id);
          const localPath = await telegramService.downloadFile(
            fileUrl,
            `${pack.name}_${i}.webp`
          );

          // Convert to WhatsApp format
          const convertedPath = await converter.convertToWhatsAppFormat(
            localPath
          );

          downloadedStickers.push({
            ...sticker,
            localPath: convertedPath,
            originalPath: localPath,
          });
        } catch (err) {
          console.error(`Failed to download sticker ${i}:`, err);
        }
      }

      if (downloadedStickers.length === 0) {
        throw new Error("Failed to download any stickers");
      }

      // Create tray icon from first sticker
      const trayIconPath = await converter.createTrayIcon(
        downloadedStickers[0].localPath
      );

      // Save the pack
      const savedPack = await savePack({
        name: pack.name,
        title: pack.title,
        stickers: downloadedStickers,
        trayIcon: trayIconPath,
        source: "telegram",
        originalPackName: pack.name,
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
        ]
      );
    } catch (error) {
      console.error("Error downloading stickers:", error);
      Alert.alert(
        "Download Failed",
        error.message || "Failed to download stickers. Please try again."
      );
    } finally {
      setDownloading(false);
    }
  };

  const renderSticker = ({ item }) => {
    const isSelected = selectedStickers.includes(item.file_id);
    return (
      <TouchableOpacity
        style={[styles.stickerItem, isSelected && styles.stickerSelected]}
        onPress={() => toggleSticker(item.file_id)}
      >
        <Image
          source={{ uri: item.thumbnail || item.file_url }}
          style={styles.stickerImage}
          resizeMode="contain"
        />
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
        <View>
          <Text style={styles.packTitle}>{pack.title}</Text>
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
            selectedStickers.length < 3 && styles.downloadButtonDisabled,
          ]}
          onPress={downloadAndSave}
          disabled={selectedStickers.length < 3}
        >
          <Text style={styles.downloadButtonText}>
            Download & Save ({selectedStickers.length} stickers)
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.noteText}>
        * WhatsApp requires minimum 3 stickers per pack
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
});
