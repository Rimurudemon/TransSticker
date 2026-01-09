import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from "react-native";
import { useStickers } from "../context/StickerContext";

export default function HomeScreen({ navigation }) {
  const { telegramBotToken, savedPacks } = useStickers();

  const features = [
    {
      title: "Import from Telegram",
      description: "Browse and download sticker packs from Telegram",
      icon: "📥",
      action: () => navigation.navigate("TelegramStickers"),
      color: "#0088cc",
    },
    {
      title: "Export to WhatsApp",
      description: "Convert and add stickers to WhatsApp",
      icon: "📤",
      action: () => {
        if (savedPacks.length > 0) {
          navigation.navigate("Saved");
        } else {
          alert("No saved packs yet. Import stickers from Telegram first!");
        }
      },
      color: "#25D366",
    },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>🎨</Text>
        <Text style={styles.title}>TransSticker</Text>
        <Text style={styles.subtitle}>
          Transfer stickers between Telegram and WhatsApp
        </Text>
      </View>

      {!telegramBotToken && (
        <TouchableOpacity
          style={styles.warningCard}
          onPress={() => navigation.navigate("Settings")}
        >
          <Text style={styles.warningIcon}>⚠️</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Setup Required</Text>
            <Text style={styles.warningText}>
              Add your Telegram Bot Token in Settings to get started
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.featuresContainer}>
        {features.map((feature, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.featureCard, { borderLeftColor: feature.color }]}
            onPress={feature.action}
          >
            <Text style={styles.featureIcon}>{feature.icon}</Text>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>
                {feature.description}
              </Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{savedPacks.length}</Text>
          <Text style={styles.statLabel}>Saved Packs</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {savedPacks.reduce(
              (total, pack) => total + (pack.stickers?.length || 0),
              0
            )}
          </Text>
          <Text style={styles.statLabel}>Total Stickers</Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works</Text>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>1</Text>
          <Text style={styles.stepText}>
            Enter a Telegram sticker pack name or URL
          </Text>
        </View>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>2</Text>
          <Text style={styles.stepText}>
            Preview and select stickers to download
          </Text>
        </View>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>3</Text>
          <Text style={styles.stepText}>
            Convert to WhatsApp format (512×512 WebP)
          </Text>
        </View>
        <View style={styles.step}>
          <Text style={styles.stepNumber}>4</Text>
          <Text style={styles.stepText}>Export to WhatsApp sticker tray</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  header: {
    alignItems: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  logo: {
    fontSize: 60,
    marginBottom: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
    textAlign: "center",
  },
  warningCard: {
    flexDirection: "row",
    backgroundColor: "#2d2d44",
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#ffa500",
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    color: "#ffa500",
    fontWeight: "bold",
    fontSize: 16,
    marginBottom: 4,
  },
  warningText: {
    color: "#aaa",
    fontSize: 14,
  },
  featuresContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  featureDescription: {
    color: "#888",
    fontSize: 14,
  },
  arrow: {
    color: "#6C63FF",
    fontSize: 24,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 4,
    alignItems: "center",
  },
  statNumber: {
    color: "#6C63FF",
    fontSize: 32,
    fontWeight: "bold",
  },
  statLabel: {
    color: "#888",
    fontSize: 14,
    marginTop: 4,
  },
  infoSection: {
    backgroundColor: "#1a1a2e",
    marginHorizontal: 16,
    marginBottom: 30,
    padding: 20,
    borderRadius: 12,
  },
  infoTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#6C63FF",
    color: "#fff",
    textAlign: "center",
    lineHeight: 28,
    fontSize: 14,
    fontWeight: "bold",
    marginRight: 12,
  },
  stepText: {
    color: "#aaa",
    fontSize: 14,
    flex: 1,
  },
});
