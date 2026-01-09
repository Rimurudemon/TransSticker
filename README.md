# TransSticker 🎨

A React Native mobile app that transfers stickers between Telegram and WhatsApp.

![Platform](https://img.shields.io/badge/platform-Android-green.svg)
![Framework](https://img.shields.io/badge/framework-React%20Native-blue.svg)
![Expo](https://img.shields.io/badge/expo-50.0.0-purple.svg)

## Features

✅ **Import from Telegram** - Browse and download sticker packs using Telegram Bot API  
✅ **Convert to WhatsApp Format** - Automatically resize to 512×512 WebP  
✅ **Save Locally** - Cache downloaded sticker packs for offline access  
✅ **Export to WhatsApp** - Share stickers or create sticker packs  
✅ **Modern UI** - Clean, dark-themed interface with smooth navigation

## Screenshots

| Home | Telegram Import | Export |
| ---- | --------------- | ------ |
| 🏠   | 📥              | 📤     |

## Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- Android device or emulator (Android 6.0+)
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

## Installation

1. **Clone and install dependencies:**

   ```bash
   cd TransSticker
   npm install
   ```

2. **Start the development server:**

   ```bash
   npx expo start
   ```

3. **Run on Android:**
   - Press `a` in the terminal to open on Android emulator
   - Or scan the QR code with Expo Go app on your device

## Getting a Telegram Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the instructions
3. Copy the API token provided
4. Paste it in the app's Settings screen

## Project Structure

```
TransSticker/
├── App.js                    # App entry point
├── app.json                  # Expo configuration
├── package.json              # Dependencies
├── src/
│   ├── context/
│   │   └── StickerContext.js # Global state management
│   ├── navigation/
│   │   └── AppNavigator.js   # Navigation setup
│   ├── screens/
│   │   ├── HomeScreen.js           # Main dashboard
│   │   ├── TelegramStickersScreen.js # Import stickers
│   │   ├── StickerPackDetailScreen.js # View/select stickers
│   │   ├── WhatsAppExportScreen.js    # Export to WhatsApp
│   │   ├── SavedPacksScreen.js        # View saved packs
│   │   └── SettingsScreen.js          # App settings
│   ├── services/
│   │   ├── TelegramService.js  # Telegram API integration
│   │   └── WhatsAppService.js  # WhatsApp integration
│   └── utils/
│       └── StickerConverter.js # Image processing
└── assets/
    ├── icon.png              # App icon (1024×1024)
    ├── splash.png            # Splash screen
    └── adaptive-icon.png     # Android adaptive icon
```

## How It Works

### 1. Import from Telegram

- Enter a sticker pack name or paste a `t.me/addstickers/...` URL
- The app fetches the pack using Telegram Bot API
- Preview and select which stickers to download

### 2. Convert for WhatsApp

- Stickers are automatically resized to 512×512 pixels
- Converted to WebP format with optimal compression
- File size is kept under 100KB per sticker

### 3. Export to WhatsApp

- Share individual stickers directly
- Create sticker packs (requires native module)

## WhatsApp Sticker Pack Integration

For full WhatsApp sticker pack integration (adding packs directly to WhatsApp), you need to implement native Android code:

### Option 1: Share Individual Stickers

The app supports sharing stickers one at a time without any additional setup.

### Option 2: Full SDK Integration

To create proper sticker packs:

1. Eject from Expo managed workflow or use `expo-dev-client`
2. Add the WhatsApp Stickers SDK to `android/app/build.gradle`
3. Implement a ContentProvider for sticker data
4. Create a native module bridge

See the [WhatsApp Stickers SDK documentation](https://github.com/nicksay/whatsapp-stickers) for details.

## Building for Production

### Build APK with EAS Build

1. Install EAS CLI:

   ```bash
   npm install -g eas-cli
   ```

2. Configure your project:

   ```bash
   eas build:configure
   ```

3. Build APK:
   ```bash
   eas build --platform android --profile preview
   ```

### Local Development Build

```bash
npx expo run:android
```

## Configuration Files

### eas.json (create this for EAS Build)

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {}
  }
}
```

## Sticker Requirements

| Platform           | Size       | Format   | Max File Size |
| ------------------ | ---------- | -------- | ------------- |
| WhatsApp Sticker   | 512×512 px | WebP     | 100 KB        |
| WhatsApp Tray Icon | 96×96 px   | PNG      | -             |
| Telegram           | Varies     | WebP/TGS | -             |

## Troubleshooting

### "Bot Token Required" error

Make sure you've added your Telegram Bot Token in the Settings screen.

### "Sticker pack not found" error

- Check if the pack name is correct
- Some packs may be private or region-restricted
- Try using the full URL: `https://t.me/addstickers/PackName`

### Stickers not loading

- Check your internet connection
- Verify the bot token is valid
- Some animated stickers (TGS format) may not display correctly

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Acknowledgments

- [Expo](https://expo.dev/) - React Native framework
- [Telegram Bot API](https://core.telegram.org/bots/api) - Sticker pack access
- [WhatsApp Stickers SDK](https://github.com/nicksay/whatsapp-stickers) - Sticker integration reference

---

Made with ❤️ for sticker lovers
