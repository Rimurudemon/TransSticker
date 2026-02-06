import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useStickers } from "../context/StickerContext";
import AnimatedSticker from "../components/AnimatedSticker";

export default function SavedPacksScreen({ navigation }) {
  const { savedPacks, removePack } = useStickers();

  const handleDeletePack = (pack) => {
    Alert.alert(
      "Delete Pack",
      `Are you sure you want to delete "${pack.title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await removePack(pack.id);
            } catch (error) {
              Alert.alert("Error", "Failed to delete pack");
            }
          },
        },
      ],
    );
  };

  const renderPack = ({ item }) => (
    <TouchableOpacity
      style={styles.packCard}
      onPress={() => navigation.navigate("SavedPackDetail", { pack: item })}
    >
      <View style={styles.packPreview}>
        {item.stickers?.slice(0, 4).map((sticker, index) => (
          <AnimatedSticker
            key={sticker.file_id || index}
            sticker={{
              ...sticker,
              is_animated: item.is_animated || sticker.is_animated,
              is_video: item.is_video || sticker.is_video,
            }}
            style={styles.previewSticker}
            resizeMode="contain"
            playing={true}
            source="local"
          />
        ))}
      </View>
      <View style={styles.packInfo}>
        <Text style={styles.packTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.packMeta}>
          {item.stickers?.length || 0} stickers • {item.source || "Telegram"}
        </Text>
        <Text style={styles.packDate}>
          Saved {new Date(item.savedAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.packActions}>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => navigation.navigate("WhatsAppExport", { pack: item })}
        >
          <Text style={styles.exportBtnText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeletePack(item)}
        >
          <Text style={styles.deleteBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (savedPacks.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📦</Text>
        <Text style={styles.emptyTitle}>No Saved Packs</Text>
        <Text style={styles.emptyText}>
          Import sticker packs from Telegram to get started
        </Text>
        <TouchableOpacity
          style={styles.importButton}
          onPress={() => navigation.navigate("Home")}
        >
          <Text style={styles.importButtonText}>Import Stickers</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={savedPacks}
        renderItem={renderPack}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  listContainer: {
    padding: 16,
  },
  packCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  packPreview: {
    flexDirection: "row",
    marginBottom: 12,
  },
  previewSticker: {
    width: 60,
    height: 60,
    marginRight: 8,
    backgroundColor: "#0f0f1a",
    borderRadius: 8,
  },
  packInfo: {
    marginBottom: 12,
  },
  packTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  packMeta: {
    color: "#6C63FF",
    fontSize: 14,
    marginBottom: 2,
  },
  packDate: {
    color: "#666",
    fontSize: 12,
  },
  packActions: {
    flexDirection: "row",
    gap: 8,
  },
  exportBtn: {
    flex: 1,
    backgroundColor: "#25D366",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  exportBtnText: {
    color: "#fff",
    fontWeight: "bold",
  },
  deleteBtn: {
    backgroundColor: "#3d1f1f",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  deleteBtnText: {
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 60,
    marginBottom: 20,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
  },
  emptyText: {
    color: "#888",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
  },
  importButton: {
    backgroundColor: "#6C63FF",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  importButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
