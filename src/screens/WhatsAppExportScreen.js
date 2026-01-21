import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  NativeModules,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import WhatsAppService from "../services/WhatsAppService";
import StickerConverter from "../utils/StickerConverter";
import AnimatedSticker from "../components/AnimatedSticker";

const whatsappService = new WhatsAppService();
const stickerConverter = new StickerConverter();

export default function WhatsAppExportScreen({ route, navigation }) {
  // Support both single pack and multiple packs
  const { pack: initialPack, allPacks, currentPackIndex: initialIndex } = route.params;
  
  const [currentPackIndex, setCurrentPackIndex] = useState(initialIndex || 0);
  const packs = allPacks || [initialPack];
  const pack = packs[currentPackIndex];
  const totalPacks = packs.length;
  const hasMultiplePacks = totalPacks > 1;

  const [packName, setPackName] = useState(pack.title || "My Sticker Pack");
  const [author, setAuthor] = useState("TransSticker");
  const [exporting, setExporting] = useState(false);
  const [nativeModuleAvailable, setNativeModuleAvailable] = useState(false);
  const [exportedPacks, setExportedPacks] = useState([]);

  useEffect(() => {
    // Check if native module is available
    setNativeModuleAvailable(whatsappService.isNativeModuleAvailable());
  }, []);

  // Update pack name when switching packs
  useEffect(() => {
    setPackName(pack.title || "My Sticker Pack");
  }, [currentPackIndex, pack.title]);

  const exportToWhatsApp = async () => {
    if (!packName.trim()) {
      Alert.alert(
        "Pack Name Required",
        "Please enter a name for your sticker pack.",
      );
      return;
    }

    if (pack.stickers.length < 3) {
      Alert.alert(
        "Not Enough Stickers",
        "WhatsApp requires at least 3 stickers per pack.",
      );
      return;
    }

    setExporting(true);

    try {
      // Check if native module is available for full integration
      if (nativeModuleAvailable) {
        await exportWithNativeModule();
      } else {
        // Fallback: offer sharing options
        await exportWithFallback();
      }
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert(
        "Export Failed",
        error.message || "Failed to export stickers. Please try again.",
      );
    } finally {
      setExporting(false);
    }
  };

  const exportWithNativeModule = async () => {
    try {
      // Create a unique identifier for this pack
      const identifier = `transsticker_${Date.now()}`;

      // Create tray icon (96x96)
      const firstSticker = pack.stickers[0];
      let trayImagePath;

      if (firstSticker?.localPath) {
        // Use the first sticker as tray icon, resized to 96x96
        trayImagePath = await stickerConverter.createTrayIcon(
          firstSticker.localPath,
        );
      } else {
        throw new Error("No stickers available to create tray icon");
      }

      // Prepare stickers array
      const stickersData = pack.stickers.map((sticker, index) => ({
        localPath: sticker.localPath,
        emojis: sticker.emoji ? [sticker.emoji] : ["😀"],
      }));

      // Determine if pack is animated by checking stickers
      // Some saved packs might not have the isAnimated flag at root level
      const hasAnimatedStickers = pack.stickers.some(
        (s) => s.is_animated || s.is_video,
      );
      const isAnimatedPack =
        pack.isAnimated ||
        pack.is_animated ||
        pack.is_video ||
        hasAnimatedStickers ||
        false;

      // Create the pack
      const packData = {
        identifier,
        name: packName.trim(),
        publisher: author.trim() || "TransSticker",
        trayImagePath,
        stickers: stickersData,
        animatedStickerPack: isAnimatedPack,
      };

      await whatsappService.createPack(packData);

      // Add to WhatsApp
      await whatsappService.addPackToWhatsApp(identifier, packName.trim());

      // Mark this pack as exported (only if not already exported)
      setExportedPacks(prev => 
        prev.includes(currentPackIndex) ? prev : [...prev, currentPackIndex]
      );

      // Check if there are more packs to export
      if (hasMultiplePacks && currentPackIndex < totalPacks - 1) {
        Alert.alert(
          `Pack ${currentPackIndex + 1} of ${totalPacks} Exported! ✅`,
          `"${packName}" has been sent to WhatsApp.\n\nReady to export the next pack?`,
          [
            {
              text: "Export Next Pack",
              onPress: () => setCurrentPackIndex(currentPackIndex + 1),
            },
            {
              text: "Done for Now",
              onPress: () => navigation.navigate("Home"),
              style: "cancel",
            },
          ],
        );
      } else {
        const successMessage = hasMultiplePacks
          ? `All ${totalPacks} sticker packs have been sent to WhatsApp!`
          : "Sticker pack has been sent to WhatsApp.";
        
        Alert.alert(
          "Success! 🎉",
          `${successMessage} Follow the prompts in WhatsApp to add them.`,
          [{ text: "OK", onPress: () => navigation.navigate("Home") }],
        );
      }
    } catch (error) {
      console.error("Native export error:", error);
      throw error;
    }
  };

  const exportWithFallback = async () => {
    // Try multiple methods to detect WhatsApp
    let whatsappAvailable = false;

    // Method 1: Try whatsapp:// scheme
    try {
      whatsappAvailable = await Linking.canOpenURL("whatsapp://send");
    } catch (e) {
      console.log("whatsapp:// check failed:", e);
    }

    // Method 2: Try WhatsApp package directly (Android)
    if (!whatsappAvailable && Platform.OS === "android") {
      try {
        whatsappAvailable = await Linking.canOpenURL("https://wa.me/");
      } catch (e) {
        console.log("wa.me check failed:", e);
      }
    }

    // Even if detection fails, offer to share (might still work)
    if (!whatsappAvailable) {
      Alert.alert(
        "WhatsApp Detection",
        "Could not detect WhatsApp automatically. This may be due to Android security restrictions.\n\nWould you like to try sharing anyway?",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          { text: "Try Sharing", onPress: () => shareStickers() },
        ],
      );
      return;
    }

    // Show export options
    Alert.alert(
      "Native Module Required",
      "Full sticker pack export requires a native build of the app.\n\n" +
        "You're running in Expo Go which doesn't support native modules.\n\n" +
        "Options:\n" +
        "• Share individual stickers as images\n" +
        "• Build the app with 'npx expo run:android' for full integration",
      [
        {
          text: "Share Stickers",
          onPress: () => shareStickers(),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ],
    );
  };

  const shareStickers = async () => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Sharing Not Available",
          "Sharing is not available on this device.",
        );
        return;
      }

      // Share the first sticker as an example
      const firstSticker = pack.stickers[0];
      if (firstSticker?.localPath) {
        await Sharing.shareAsync(firstSticker.localPath, {
          mimeType: "image/webp",
          dialogTitle: "Share Sticker",
        });
      }
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("Share Failed", "Failed to share sticker.");
    }
  };

  const renderSticker = ({ item, index }) => (
    <View style={styles.stickerItem}>
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
      <Text style={styles.stickerNumber}>{index + 1}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Multi-pack indicator */}
      {hasMultiplePacks && (
        <View style={styles.multiPackHeader}>
          <View style={styles.multiPackInfo}>
            <Text style={styles.multiPackTitle}>
              📦 Pack {currentPackIndex + 1} of {totalPacks}
            </Text>
            <Text style={styles.multiPackSubtitle}>
              {exportedPacks.length} exported • {totalPacks - exportedPacks.length} remaining
            </Text>
          </View>
          
          {/* Pack navigation */}
          <View style={styles.packNavigation}>
            <TouchableOpacity
              style={[
                styles.packNavButton,
                currentPackIndex === 0 && styles.packNavButtonDisabled,
              ]}
              onPress={() => setCurrentPackIndex(Math.max(0, currentPackIndex - 1))}
              disabled={currentPackIndex === 0}
            >
              <Text style={styles.packNavButtonText}>◀ Prev</Text>
            </TouchableOpacity>

            <View style={styles.packDotsContainer}>
              {packs.map((p, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => setCurrentPackIndex(index)}
                  style={[
                    styles.packDot,
                    index === currentPackIndex && styles.packDotActive,
                    exportedPacks.includes(index) && styles.packDotExported,
                  ]}
                >
                  {exportedPacks.includes(index) ? (
                    <Text style={styles.packDotCheck}>✓</Text>
                  ) : (
                    <Text style={styles.packDotNumber}>{index + 1}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.packNavButton,
                currentPackIndex === totalPacks - 1 && styles.packNavButtonDisabled,
              ]}
              onPress={() => setCurrentPackIndex(Math.min(totalPacks - 1, currentPackIndex + 1))}
              disabled={currentPackIndex === totalPacks - 1}
            >
              <Text style={styles.packNavButtonText}>Next ▶</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.packSelectHint}>
            Tap a pack number to select it, or use Prev/Next buttons
          </Text>
        </View>
      )}

      <View style={styles.formContainer}>
        <Text style={styles.label}>Pack Name</Text>
        <TextInput
          style={styles.input}
          value={packName}
          onChangeText={setPackName}
          placeholder="Enter sticker pack name"
          placeholderTextColor="#666"
          maxLength={128}
        />

        <Text style={styles.label}>Author</Text>
        <TextInput
          style={styles.input}
          value={author}
          onChangeText={setAuthor}
          placeholder="Enter author name"
          placeholderTextColor="#666"
          maxLength={128}
        />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{pack.stickers?.length || 0}</Text>
            <Text style={styles.statLabel}>Stickers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>512×512</Text>
            <Text style={styles.statLabel}>Size</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>WebP</Text>
            <Text style={styles.statLabel}>Format</Text>
          </View>
        </View>
      </View>

      <Text style={styles.previewTitle}>
        Preview ({pack.stickers?.length || 0} stickers)
      </Text>

      <FlatList
        data={pack.stickers || []}
        renderItem={renderSticker}
        keyExtractor={(item, index) => item.file_id || index.toString()}
        numColumns={4}
        contentContainerStyle={styles.stickerGrid}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
        onPress={exportToWhatsApp}
        disabled={exporting}
      >
        {exporting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.exportButtonIcon}>📤</Text>
            <Text style={styles.exportButtonText}>
              {hasMultiplePacks
                ? `Export Pack ${currentPackIndex + 1} to WhatsApp`
                : "Export to WhatsApp"}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.noteText}>
        {hasMultiplePacks
          ? `Exporting pack ${currentPackIndex + 1} of ${totalPacks} • Make sure WhatsApp is installed`
          : "Make sure WhatsApp is installed on your device"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  formContainer: {
    padding: 16,
    backgroundColor: "#1a1a2e",
    margin: 16,
    borderRadius: 12,
  },
  label: {
    color: "#888",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#0f0f1a",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 16,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
  },
  stat: {
    alignItems: "center",
  },
  statValue: {
    color: "#6C63FF",
    fontSize: 18,
    fontWeight: "bold",
  },
  statLabel: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  previewTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  stickerGrid: {
    paddingHorizontal: 12,
    paddingBottom: 120,
  },
  stickerItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 4,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 8,
    position: "relative",
  },
  stickerImage: {
    width: "100%",
    height: "100%",
  },
  stickerNumber: {
    position: "absolute",
    bottom: 4,
    right: 4,
    color: "#666",
    fontSize: 10,
  },
  exportButton: {
    position: "absolute",
    bottom: 40,
    left: 16,
    right: 16,
    backgroundColor: "#25D366",
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonIcon: {
    fontSize: 20,
  },
  exportButtonText: {
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
  // Multi-pack styles
  multiPackHeader: {
    backgroundColor: "rgba(108, 99, 255, 0.15)",
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#6C63FF",
  },
  multiPackInfo: {
    marginBottom: 10,
  },
  multiPackTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  multiPackSubtitle: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 4,
  },
  packNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  packNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#2d2d44",
    borderRadius: 6,
  },
  packNavButtonDisabled: {
    opacity: 0.4,
  },
  packNavButtonText: {
    color: "#6C63FF",
    fontSize: 12,
    fontWeight: "600",
  },
  packDotsContainer: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
    justifyContent: "center",
  },
  packDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#3d3d5c",
    justifyContent: "center",
    alignItems: "center",
  },
  packDotActive: {
    backgroundColor: "#6C63FF",
    borderWidth: 2,
    borderColor: "#fff",
  },
  packDotExported: {
    backgroundColor: "#25D366",
  },
  packDotNumber: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  packDotCheck: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  packSelectHint: {
    color: "#888",
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    fontStyle: "italic",
  },
});
