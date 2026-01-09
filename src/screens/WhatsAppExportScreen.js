import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

export default function WhatsAppExportScreen({ route, navigation }) {
  const { pack } = route.params;
  const [packName, setPackName] = useState(pack.title || "My Sticker Pack");
  const [author, setAuthor] = useState("TransSticker");
  const [exporting, setExporting] = useState(false);

  const exportToWhatsApp = async () => {
    if (!packName.trim()) {
      Alert.alert(
        "Pack Name Required",
        "Please enter a name for your sticker pack."
      );
      return;
    }

    if (pack.stickers.length < 3) {
      Alert.alert(
        "Not Enough Stickers",
        "WhatsApp requires at least 3 stickers per pack."
      );
      return;
    }

    setExporting(true);

    try {
      // Note: Direct WhatsApp Sticker integration requires native module
      // This implementation uses sharing as a fallback

      // Check if WhatsApp is installed
      const whatsappUrl = "whatsapp://";
      const canOpen = await Linking.canOpenURL(whatsappUrl);

      if (!canOpen) {
        Alert.alert(
          "WhatsApp Not Found",
          "Please install WhatsApp to export stickers.",
          [{ text: "OK" }]
        );
        setExporting(false);
        return;
      }

      // For full WhatsApp Sticker pack integration, you would need:
      // 1. Android: Use the official WhatsApp Stickers SDK (native module)
      // 2. Create a content provider for the sticker pack
      // 3. Register the sticker pack with proper metadata

      // Current implementation: Share stickers individually
      Alert.alert(
        "Export Method",
        "How would you like to export your stickers?",
        [
          {
            text: "Share Individual Stickers",
            onPress: () => shareStickers(),
          },
          {
            text: "Create Sticker Pack (Requires Setup)",
            onPress: () => showNativeSetupInfo(),
          },
          {
            text: "Cancel",
            style: "cancel",
          },
        ]
      );
    } catch (error) {
      console.error("Export error:", error);
      Alert.alert(
        "Export Failed",
        "Failed to export stickers. Please try again."
      );
    } finally {
      setExporting(false);
    }
  };

  const shareStickers = async () => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          "Sharing Not Available",
          "Sharing is not available on this device."
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

  const showNativeSetupInfo = () => {
    Alert.alert(
      "Native Integration Required",
      "Full WhatsApp Sticker Pack integration requires setting up the WhatsApp Stickers SDK in a native Android module.\n\n" +
        "Steps:\n" +
        "1. Add whatsapp-stickers-sdk to your project\n" +
        "2. Create a ContentProvider for stickers\n" +
        "3. Register your sticker packs\n\n" +
        "See the project README for detailed instructions.",
      [{ text: "OK" }]
    );
  };

  const renderSticker = ({ item, index }) => (
    <View style={styles.stickerItem}>
      <Image
        source={{ uri: item.localPath || item.thumbnail }}
        style={styles.stickerImage}
        resizeMode="contain"
      />
      <Text style={styles.stickerNumber}>{index + 1}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
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
            <Text style={styles.exportButtonText}>Export to WhatsApp</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.noteText}>
        Make sure WhatsApp is installed on your device
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
});
