import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from "react-native";
import { useStickers } from "../context/StickerContext";

export default function SettingsScreen() {
  const { telegramBotToken, setBotToken } = useStickers();
  const [token, setToken] = useState(telegramBotToken);
  const [showToken, setShowToken] = useState(false);

  const saveToken = async () => {
    if (!token.trim()) {
      Alert.alert("Invalid Token", "Please enter a valid Telegram Bot Token");
      return;
    }

    try {
      await setBotToken(token.trim());
      Alert.alert("Success", "Bot token saved successfully!");
    } catch (error) {
      Alert.alert("Error", "Failed to save bot token");
    }
  };

  const openBotFather = () => {
    Linking.openURL("https://t.me/BotFather");
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Telegram Bot Token</Text>
        <Text style={styles.sectionDescription}>
          Required to access Telegram sticker packs. Get your token from
          @BotFather.
        </Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            placeholder="Enter your bot token"
            placeholderTextColor="#666"
            secureTextEntry={!showToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={styles.showButton}
            onPress={() => setShowToken(!showToken)}
          >
            <Text style={styles.showButtonText}>{showToken ? "🙈" : "👁"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.saveButton} onPress={saveToken}>
            <Text style={styles.saveButtonText}>Save Token</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.helpButton} onPress={openBotFather}>
            <Text style={styles.helpButtonText}>Get Token</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How to Get a Bot Token</Text>
        <View style={styles.stepContainer}>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>1</Text>
            <Text style={styles.stepText}>
              Open Telegram and search for @BotFather
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>2</Text>
            <Text style={styles.stepText}>
              Send /newbot command and follow the instructions
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>3</Text>
            <Text style={styles.stepText}>
              Copy the API token provided by BotFather
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={styles.stepNumber}>4</Text>
            <Text style={styles.stepText}>Paste it above and save</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.aboutItem}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>1.0.0</Text>
        </View>
        <View style={styles.aboutItem}>
          <Text style={styles.aboutLabel}>Developer</Text>
          <Text style={styles.aboutValue}>TransSticker Team</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sticker Requirements</Text>
        <View style={styles.requirementItem}>
          <Text style={styles.requirementLabel}>WhatsApp Format</Text>
          <Text style={styles.requirementValue}>512×512 WebP</Text>
        </View>
        <View style={styles.requirementItem}>
          <Text style={styles.requirementLabel}>Max File Size</Text>
          <Text style={styles.requirementValue}>100 KB per sticker</Text>
        </View>
        <View style={styles.requirementItem}>
          <Text style={styles.requirementLabel}>Min Stickers/Pack</Text>
          <Text style={styles.requirementValue}>3 stickers</Text>
        </View>
        <View style={styles.requirementItem}>
          <Text style={styles.requirementLabel}>Max Stickers/Pack</Text>
          <Text style={styles.requirementValue}>30 stickers</Text>
        </View>
        <View style={styles.requirementItem}>
          <Text style={styles.requirementLabel}>Tray Icon</Text>
          <Text style={styles.requirementValue}>96×96 PNG</Text>
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
  section: {
    backgroundColor: "#1a1a2e",
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  sectionDescription: {
    color: "#888",
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 14,
  },
  showButton: {
    backgroundColor: "#0f0f1a",
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  showButtonText: {
    fontSize: 18,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  saveButton: {
    flex: 1,
    backgroundColor: "#6C63FF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  helpButton: {
    backgroundColor: "#0088cc",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  helpButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  stepContainer: {
    marginTop: 8,
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
  aboutItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2d2d44",
  },
  aboutLabel: {
    color: "#888",
    fontSize: 14,
  },
  aboutValue: {
    color: "#fff",
    fontSize: 14,
  },
  requirementItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#2d2d44",
  },
  requirementLabel: {
    color: "#888",
    fontSize: 14,
  },
  requirementValue: {
    color: "#6C63FF",
    fontSize: 14,
    fontWeight: "500",
  },
});
