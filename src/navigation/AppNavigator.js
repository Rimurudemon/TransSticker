import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
import { Text, View, StyleSheet } from "react-native";

// Screens
import HomeScreen from "../screens/HomeScreen";
import TelegramStickersScreen from "../screens/TelegramStickersScreen";
import StickerPackDetailScreen from "../screens/StickerPackDetailScreen";
import SavedPackDetailScreen from "../screens/SavedPackDetailScreen";
import WhatsAppExportScreen from "../screens/WhatsAppExportScreen";
import SavedPacksScreen from "../screens/SavedPacksScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Tab Icon Component
const TabIcon = ({ name, focused }) => (
  <View style={[styles.iconContainer, focused && styles.iconFocused]}>
    <Text style={[styles.iconText, focused && styles.iconTextFocused]}>
      {name.charAt(0)}
    </Text>
  </View>
);

// Home Stack Navigator
function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#6C63FF" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Stack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ title: "TransSticker" }}
      />
      <Stack.Screen
        name="TelegramStickers"
        component={TelegramStickersScreen}
        options={{ title: "Telegram Stickers" }}
      />
      <Stack.Screen
        name="StickerPackDetail"
        component={StickerPackDetailScreen}
        options={{ title: "Sticker Pack" }}
      />
      <Stack.Screen
        name="WhatsAppExport"
        component={WhatsAppExportScreen}
        options={{ title: "Export to WhatsApp" }}
      />
    </Stack.Navigator>
  );
}

// Saved Packs Stack Navigator
function SavedStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#6C63FF" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Stack.Screen
        name="SavedMain"
        component={SavedPacksScreen}
        options={{ title: "Saved Packs" }}
      />
      <Stack.Screen
        name="SavedPackDetail"
        component={SavedPackDetailScreen}
        options={{ title: "Saved Pack" }}
      />
      <Stack.Screen
        name="WhatsAppExport"
        component={WhatsAppExportScreen}
        options={{ title: "Export to WhatsApp" }}
      />
    </Stack.Navigator>
  );
}

// Settings Stack Navigator
function SettingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: "#6C63FF" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Stack.Screen
        name="SettingsMain"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
    </Stack.Navigator>
  );
}

// Main Tab Navigator
export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1a1a2e",
          borderTopColor: "#2d2d44",
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#6C63FF",
        tabBarInactiveTintColor: "#888",
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Saved" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2d2d44",
    justifyContent: "center",
    alignItems: "center",
  },
  iconFocused: {
    backgroundColor: "#6C63FF",
  },
  iconText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "bold",
  },
  iconTextFocused: {
    color: "#fff",
  },
});
