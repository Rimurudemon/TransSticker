# TransSticker - Telegram to WhatsApp Sticker Transfer App

## Project Overview

TransSticker is a React Native Expo mobile application that facilitates the transfer of stickers between Telegram and WhatsApp.

## Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: React Navigation (Stack & Tab navigators)
- **State Management**: React Context API
- **Image Processing**: expo-image-manipulator
- **File System**: expo-file-system
- **HTTP Client**: axios

## Project Structure

```
/src
  /screens      - App screens (Home, TelegramStickers, WhatsAppExport, etc.)
  /components   - Reusable UI components
  /services     - API services (Telegram, WhatsApp integration)
  /utils        - Utility functions (image processing, conversion)
  /context      - React Context providers
  /assets       - Static assets (images, icons)
```

## Key Features

1. Browse Telegram sticker packs via Bot API
2. Download and cache stickers locally
3. Convert stickers to WhatsApp format (512x512 WebP)
4. Export sticker packs to WhatsApp
5. View and manage saved sticker packs

## Development Commands

- `npx expo start` - Start development server
- `npx expo run:android` - Run on Android device/emulator
- `npx expo build:android` - Build Android APK

## API Requirements

- Telegram Bot Token (required for accessing sticker packs)
- WhatsApp Stickers SDK integration for Android

## Notes

- Stickers must be 512x512 pixels for WhatsApp
- WhatsApp requires WebP format
- Each WhatsApp pack needs a 96x96 tray icon
