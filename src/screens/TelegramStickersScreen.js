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
} from "react-native";
import { useStickers } from "../context/StickerContext";
import TelegramService from "../services/TelegramService";

export default function TelegramStickersScreen({ navigation }) {
  const { telegramBotToken, setCurrentPack } = useStickers();
  const [packInput, setPackInput] = useState("");
  const [stickerPack, setStickerPack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const extractPackName = (input) => {
    // Handle full URLs like https://t.me/addstickers/PackName
    const urlMatch = input.match(
      /(?:t\.me\/addstickers\/|telegram\.me\/addstickers\/)([a-zA-Z0-9_]+)/
    );
    if (urlMatch) {
      return urlMatch[1];
    }
    // Otherwise treat as pack name directly
    return input.trim();
  };

  const fetchStickerPack = async () => {
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

    if (!packInput.trim()) {
      setError("Please enter a sticker pack name or URL");
      return;
    }

    setLoading(true);
    setError("");
    setStickerPack(null);

    try {
      const packName = extractPackName(packInput);
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
          onPress={fetchStickerPack}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
        </View>
      ) : null}

      {stickerPack && (
        <View style={styles.packContainer}>
          <View style={styles.packHeader}>
            <View>
              <Text style={styles.packName}>{stickerPack.name}</Text>
              <Text style={styles.packTitle}>{stickerPack.title}</Text>
              <Text style={styles.stickerCount}>
                {stickerPack.stickers?.length || 0} stickers
              </Text>
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

      {!stickerPack && !loading && !error && (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholderIcon}>🔍</Text>
          <Text style={styles.placeholderTitle}>Search for Stickers</Text>
          <Text style={styles.placeholderText}>
            Enter a Telegram sticker pack name or paste a t.me/addstickers link
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
  selectButton: {
    backgroundColor: "#25D366",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
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
