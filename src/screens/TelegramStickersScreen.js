import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
} from "react-native";
import { WebView } from "react-native-webview";
import { useStickers } from "../context/StickerContext";
import TelegramService from "../services/TelegramService";

export default function TelegramStickersScreen({ navigation }) {
  const { telegramBotToken, setCurrentPack } = useStickers();
  const [packInput, setPackInput] = useState("");
  const [stickerPack, setStickerPack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("https://tlgrm.eu/stickers");
  const [canImportFromBrowser, setCanImportFromBrowser] = useState(false);

  const extractPackName = (input) => {
    if (!input) return "";
    // Handle full URLs like https://t.me/addstickers/PackName
    const urlMatch = input.match(
      /(?:t\.me\/addstickers\/|telegram\.me\/addstickers\/)([a-zA-Z0-9_]+)/
    );
    if (urlMatch) {
      return urlMatch[1];
    }
    // Handle tg protocol like tg://addstickers?set=PackName
    const tgMatch = input.match(/addstickers\?set=([a-zA-Z0-9_]+)/);
    if (tgMatch) {
      return tgMatch[1];
    }
    // Handle tlgrm.eu/stickers/PackName format
    const tlgrmMatch = input.match(/tlgrm\.eu\/stickers\/([a-zA-Z0-9_]+)/);
    if (tlgrmMatch) {
      return tlgrmMatch[1];
    }
    // Otherwise treat as pack name directly
    return input.trim();
  };

  const fetchStickerPack = async (nameOverride) => {
    if (!telegramBotToken) {
      Alert.alert(
        "Bot Token Required",
        "Please set your Telegram Bot Token in Settings first.",
        [
          {
            text: "Go to Settings",
            onPress: () => navigation.navigate("Settings"),
          },
        ]
      );
      return;
    }

    const nameToSearch = nameOverride || packInput;

    if (!nameToSearch || !nameToSearch.trim()) {
      setError("Please enter a sticker pack name or URL");
      return;
    }

    setLoading(true);
    setError("");
    setStickerPack(null);

    // If fetch was triggered by browser, update input visually
    if (nameOverride) {
      setPackInput(nameOverride);
    }

    try {
      const packName = extractPackName(nameToSearch);
      const telegramService = new TelegramService(telegramBotToken);
      const pack = await telegramService.getStickerPack(packName);

      setStickerPack(pack);
    } catch (err) {
      console.error("Error fetching sticker pack:", err);
      setError(
        err.message ||
          "Failed to fetch sticker pack. Please check the pack name."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPack = () => {
    if (stickerPack) {
      setCurrentPack(stickerPack);
      navigation.navigate("StickerPackDetail", { pack: stickerPack });
    }
  };

  // Enhanced Browser Handler
  const handleWebViewStateChange = (event) => {
    const url = event.url;
    setBrowserUrl(url);

    // Check if current page is a sticker pack page
    const packName = extractPackName(url);
    const isPackPage =
      packName &&
      packName !== url &&
      !url.includes("google") &&
      /^[a-zA-Z0-9_]+$/.test(packName) &&
      packName.toLowerCase() !== "addstickers";

    setCanImportFromBrowser(isPackPage);
  };

  const handleImportFromBrowser = () => {
    const packName = extractPackName(browserUrl);
    if (packName) {
      setShowBrowser(false);
      setTimeout(() => fetchStickerPack(packName), 500);
    }
  };

  const renderSticker = ({ item, index }) => (
    <View style={styles.stickerItem}>
      <Image
        source={{ uri: item.thumbnail || item.file_url }}
        style={styles.stickerImage}
        resizeMode="contain"
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter sticker pack name or t.me URL"
          placeholderTextColor="#666"
          value={packInput}
          onChangeText={setPackInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[styles.searchButton, loading && styles.searchButtonDisabled]}
          onPress={() => fetchStickerPack()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* New Browse Button */}
      <TouchableOpacity
        style={styles.browseButton}
        onPress={() => setShowBrowser(true)}
      >
        <Text style={styles.browseButtonText}>🌐 Find Packs Online</Text>
      </TouchableOpacity>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      ) : null}

      {stickerPack && (
        <View style={styles.packContainer}>
          <View style={styles.packHeader}>
            <View style={styles.packInfo}>
              <Text style={styles.packName} numberOfLines={1}>
                {stickerPack.name}
              </Text>
              <Text style={styles.packTitle} numberOfLines={1}>
                {stickerPack.title}
              </Text>
              <Text style={styles.stickerCount}>
                {stickerPack.stickers?.length || 0} stickers
              </Text>
              {stickerPack.is_animated && (
                <View style={styles.animatedBadge}>
                  <Text style={styles.animatedText}>▶ Animated</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.selectButton}
              onPress={handleSelectPack}
            >
              <Text style={styles.selectButtonText}>Select Pack</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={stickerPack.stickers || []}
            renderItem={renderSticker}
            keyExtractor={(item, index) => item.file_id || index.toString()}
            numColumns={4}
            contentContainerStyle={styles.stickerGrid}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      {/* Placeholder content when no pack is loaded */}
      {!stickerPack && !loading && !error && (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderIcon}>🔍</Text>
          <Text style={styles.placeholderTitle}>Search for Stickers</Text>
          <Text style={styles.placeholderText}>
            Enter a Telegram sticker pack name, paste a t.me/addstickers link,
            or use the online browser.
          </Text>
          <View style={styles.exampleContainer}>
            <Text style={styles.exampleLabel}>Examples:</Text>
            <Text style={styles.exampleText}>• Animals</Text>
            <Text style={styles.exampleText}>
              • https://t.me/addstickers/HotCherry
            </Text>
          </View>
        </View>
      )}

      {/* Browser Modal */}
      <Modal
        visible={showBrowser}
        animationType="slide"
        onRequestClose={() => setShowBrowser(false)}
      >
        <SafeAreaView style={styles.browserSafeArea}>
          <View style={styles.browserHeader}>
            <TouchableOpacity
              onPress={() => setShowBrowser(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>

            {canImportFromBrowser ? (
              <TouchableOpacity
                style={styles.importBrowserButton}
                onPress={handleImportFromBrowser}
              >
                <Text style={styles.importBrowserButtonText}>
                  📥 Choose this Pack
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.browserTitle}>Find stickers...</Text>
            )}
          </View>
          <WebView
            source={{ uri: "https://tlgrm.eu/stickers" }}
            onNavigationStateChange={handleWebViewStateChange}
            startInLoadingState={true}
            style={{ flex: 1 }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  searchContainer: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 0,
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 14,
    color: "#fff",
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: "#6C63FF",
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  // Browse Button Styles
  browseButton: {
    backgroundColor: "#25D366", // WhatsApp Green for action
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 10,
  },
  browseButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  // Browser Modal Styles
  browserSafeArea: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    paddingTop: 10,
  },
  browserHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#1a1a2e",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    minHeight: 60,
  },
  closeButton: {
    padding: 10,
  },
  closeButtonText: {
    color: "#6C63FF",
    fontSize: 16,
    fontWeight: "600",
  },
  browserTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#888",
    marginRight: 10,
  },
  importBrowserButton: {
    backgroundColor: "#25D366",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  importBrowserButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
  },
  // Existing Error Styles
  errorContainer: {
    backgroundColor: "#3d1f1f",
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
  },
  packContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  packHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  packInfo: {
    flex: 1,
    marginRight: 12,
  },
  packName: {
    color: "#6C63FF",
    fontSize: 14,
    marginBottom: 4,
  },
  packTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  stickerCount: {
    color: "#888",
    fontSize: 14,
  },
  animatedBadge: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  animatedText: {
    color: "#000",
    fontSize: 10,
    fontWeight: "bold",
  },
  selectButton: {
    backgroundColor: "#25D366",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexShrink: 0,
  },
  selectButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  stickerGrid: {
    paddingBottom: 20,
  },
  stickerItem: {
    flex: 1,
    aspectRatio: 1,
    margin: 4,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 8,
  },
  stickerImage: {
    width: "100%",
    height: "100%",
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  placeholderIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  placeholderTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
  },
  placeholderText: {
    color: "#888",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  exampleContainer: {
    backgroundColor: "#1a1a2e",
    padding: 16,
    borderRadius: 12,
    width: "100%",
  },
  exampleLabel: {
    color: "#6C63FF",
    fontWeight: "bold",
    marginBottom: 8,
  },
  exampleText: {
    color: "#aaa",
    fontSize: 14,
    marginBottom: 4,
  },
});
