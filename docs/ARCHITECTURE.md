# TransSticker - Technical Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              TRANSSTICKER APP                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    HOME      │    │   TELEGRAM   │    │    SAVED     │    │   SETTINGS   │  │
│  │   SCREEN     │───▶│   IMPORT     │───▶│    PACKS     │───▶│    SCREEN    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │                              │
│         ▼                   ▼                   ▼                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      STICKER CONTEXT (Global State)                      │  │
│  │  • Bot Token    • Saved Packs    • Current Pack    • Loading State      │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                         │
│         ┌────────────────────────────┼────────────────────────────┐           │
│         ▼                            ▼                            ▼           │
│  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐      │
│  │   TELEGRAM   │           │   STICKER    │           │   WHATSAPP   │      │
│  │   SERVICE    │           │  CONVERTER   │           │   SERVICE    │      │
│  └──────────────┘           └──────────────┘           └──────────────┘      │
│         │                            │                            │           │
│         ▼                            ▼                            ▼           │
│  ┌──────────────┐           ┌──────────────┐           ┌──────────────┐      │
│  │  Telegram    │           │    expo-     │           │   WhatsApp   │      │
│  │  Bot API     │           │    image-    │           │   Sharing    │      │
│  │  (External)  │           │  manipulator │           │   Intent     │      │
│  └──────────────┘           └──────────────┘           └──────────────┘      │
│                                                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STICKER IMPORT PIPELINE                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

     USER INPUT                    TELEGRAM API                    LOCAL STORAGE
         │                              │                               │
         ▼                              │                               │
┌─────────────────┐                     │                               │
│ Enter pack name │                     │                               │
│ or t.me URL     │                     │                               │
└────────┬────────┘                     │                               │
         │                              │                               │
         ▼                              │                               │
┌─────────────────┐                     │                               │
│ Extract pack    │                     │                               │
│ name from URL   │                     │                               │
└────────┬────────┘                     │                               │
         │                              │                               │
         ▼                              ▼                               │
         │                    ┌─────────────────┐                       │
         └───────────────────▶│ getStickerSet   │                       │
                              │ API Call        │                       │
                              └────────┬────────┘                       │
                                       │                                │
                                       ▼                                │
                              ┌─────────────────┐                       │
                              │ Get file paths  │                       │
                              │ for each sticker│                       │
                              └────────┬────────┘                       │
                                       │                                │
                                       ▼                                │
                              ┌─────────────────┐                       │
                              │ Download WebP   │                       │
                              │ files           │──────────────────────▶│
                              └────────┬────────┘                       │
                                       │                         ┌──────┴──────┐
                                       ▼                         │ Cache Dir   │
                              ┌─────────────────┐                │ /transstick │
                              │ Return sticker  │                │ er/cache/   │
                              │ pack metadata   │                └─────────────┘
                              └─────────────────┘
```

---

## Sticker Conversion Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      WHATSAPP CONVERSION PIPELINE                                │
└─────────────────────────────────────────────────────────────────────────────────┘

  TELEGRAM FORMAT                  CONVERTER                    WHATSAPP FORMAT
        │                              │                              │
        ▼                              │                              │
┌─────────────────┐                    │                              │
│ Input Sticker   │                    │                              │
│ (Various sizes) │                    │                              │
│ WebP/TGS format │                    │                              │
└────────┬────────┘                    │                              │
         │                             │                              │
         ▼                             ▼                              │
         │                    ┌─────────────────┐                     │
         └───────────────────▶│ ImageManipulator│                     │
                              │ .manipulateAsync│                     │
                              └────────┬────────┘                     │
                                       │                              │
                                       ▼                              │
                              ┌─────────────────┐                     │
                              │ Resize to       │                     │
                              │ 512 × 512 px    │                     │
                              └────────┬────────┘                     │
                                       │                              │
                                       ▼                              │
                              ┌─────────────────┐                     │
                              │ Convert to WebP │                     │
                              │ compress: 0.9   │                     │
                              └────────┬────────┘                     │
                                       │                              │
                                       ▼                              │
                              ┌─────────────────┐                     │
                              │ Check file size │                     │
                              │ < 100 KB?       │                     │
                              └────────┬────────┘                     │
                                       │                              │
                          ┌────────────┴────────────┐                 │
                          │                         │                 │
                     YES  ▼                    NO   ▼                 │
              ┌─────────────────┐        ┌─────────────────┐         │
              │     Done ✓     │        │ Reduce quality  │         │
              └────────┬────────┘        │ & retry         │         │
                       │                 └────────┬────────┘         │
                       │                          │                   │
                       │                          └───────────────────│──┐
                       │                                              │  │
                       ▼                                              ▼  │
              ┌─────────────────────────────────────────────────────────┐│
              │                 OUTPUT STICKER                          ││
              │  • Size: 512 × 512 pixels                              ││
              │  • Format: WebP                                        ◀┘
              │  • Max size: 100 KB                                     │
              └─────────────────────────────────────────────────────────┘
```

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            COMPONENT HIERARCHY                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │     App.js      │
                              │  (Entry Point)  │
                              └────────┬────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ GestureHandler  │         │  SafeAreaProv   │         │ StickerProvider │
│   RootView      │         │                 │         │   (Context)     │
└─────────────────┘         └─────────────────┘         └────────┬────────┘
                                                                  │
                                                                  ▼
                                                       ┌─────────────────┐
                                                       │ Navigation      │
                                                       │ Container       │
                                                       └────────┬────────┘
                                                                │
                                                                ▼
                                                       ┌─────────────────┐
                                                       │  AppNavigator   │
                                                       │ (Tab Navigator) │
                                                       └────────┬────────┘
                                                                │
                    ┌───────────────────────────────────────────┼───────────────┐
                    │                           │                               │
                    ▼                           ▼                               ▼
         ┌─────────────────┐         ┌─────────────────┐             ┌─────────────────┐
         │   HomeStack     │         │   SavedStack    │             │  SettingsStack  │
         │ (Stack Nav)     │         │ (Stack Nav)     │             │  (Stack Nav)    │
         └────────┬────────┘         └────────┬────────┘             └────────┬────────┘
                  │                           │                               │
    ┌─────────────┼─────────────┐             │                               │
    │             │             │             │                               │
    ▼             ▼             ▼             ▼                               ▼
┌───────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐                    ┌─────────┐
│ Home  │   │Telegram │   │ Sticker │   │ Saved   │                    │Settings │
│Screen │   │Stickers │   │PackDet. │   │ Packs   │                    │ Screen  │
└───────┘   └─────────┘   └─────────┘   └─────────┘                    └─────────┘
                │               │
                │               ▼
                │         ┌─────────────┐
                └────────▶│  WhatsApp   │
                          │   Export    │
                          └─────────────┘
```

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STATE MANAGEMENT (Context API)                           │
└─────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │  StickerContext │
                              │                 │
                              │  State:         │
                              │  • botToken     │
                              │  • savedPacks   │
                              │  • currentPack  │
                              │  • isLoading    │
                              │  • error        │
                              └────────┬────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│    ACTIONS      │         │    REDUCER      │         │   PERSISTENCE   │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ setBotToken()   │────────▶│ SET_BOT_TOKEN   │────────▶│ config.json     │
│ savePack()      │────────▶│ ADD_SAVED_PACK  │────────▶│ saved_packs.json│
│ removePack()    │────────▶│ REMOVE_PACK     │────────▶│ Update file     │
│ setCurrentPack()│────────▶│ SET_CURRENT     │         │                 │
│ setLoading()    │────────▶│ SET_LOADING     │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘

                         STORAGE LOCATION:
                    ┌─────────────────────────────┐
                    │ FileSystem.documentDirectory │
                    │ └── transsticker/            │
                    │     ├── config.json          │
                    │     ├── saved_packs.json     │
                    │     ├── cache/               │
                    │     └── converted/           │
                    └─────────────────────────────┘
```

---

## API Integration

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TELEGRAM BOT API FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

   APP                           TELEGRAM API                      RESPONSE
    │                                 │                                │
    │  GET /bot{TOKEN}/getStickerSet  │                                │
    │  ?name={PACK_NAME}              │                                │
    ├────────────────────────────────▶│                                │
    │                                 │                                │
    │                                 │  {                             │
    │                                 │    "ok": true,                 │
    │                                 │    "result": {                 │
    │                                 │      "name": "PackName",       │
    │                                 │      "title": "Pack Title",    │
    │                                 │      "stickers": [             │
    │◀────────────────────────────────│        {                       │
    │                                 │          "file_id": "xxx",     │
    │                                 │          "emoji": "😀",        │
    │                                 │          "thumbnail": {...}    │
    │                                 │        }                       │
    │                                 │      ]                         │
    │                                 │    }                           │
    │                                 │  }                             │
    │                                 │                                │
    │  GET /bot{TOKEN}/getFile        │                                │
    │  ?file_id={FILE_ID}             │                                │
    ├────────────────────────────────▶│                                │
    │                                 │                                │
    │◀────────────────────────────────│  { "file_path": "stickers/..." }
    │                                 │                                │
    │  GET /file/bot{TOKEN}/{PATH}    │                                │
    ├────────────────────────────────▶│                                │
    │                                 │                                │
    │◀────────────────────────────────│  [Binary WebP Data]            │
    │                                 │                                │
```

---

## File Structure

```
TransSticker/
├── App.js                          # Root component with providers
├── app.json                        # Expo configuration
├── package.json                    # Dependencies
├── eas.json                        # EAS Build configuration
│
├── src/
│   ├── context/
│   │   └── StickerContext.js       # Global state with useReducer
│   │
│   ├── navigation/
│   │   └── AppNavigator.js         # Tab + Stack navigation setup
│   │
│   ├── screens/
│   │   ├── HomeScreen.js           # Dashboard with quick actions
│   │   ├── TelegramStickersScreen.js   # Search & preview packs
│   │   ├── StickerPackDetailScreen.js  # Select stickers to download
│   │   ├── WhatsAppExportScreen.js     # Configure & export pack
│   │   ├── SavedPacksScreen.js         # View downloaded packs
│   │   └── SettingsScreen.js           # Bot token configuration
│   │
│   ├── services/
│   │   ├── TelegramService.js      # Telegram Bot API wrapper
│   │   └── WhatsAppService.js      # WhatsApp export logic
│   │
│   └── utils/
│       └── StickerConverter.js     # Image resize & format conversion
│
└── assets/
    ├── icon.png                    # App icon (1024×1024)
    ├── splash.png                  # Splash screen
    └── adaptive-icon.png           # Android adaptive icon
```

---

## Key Technologies

| Layer          | Technology                 | Purpose                           |
| -------------- | -------------------------- | --------------------------------- |
| **Framework**  | React Native + Expo        | Cross-platform mobile development |
| **Navigation** | React Navigation 6         | Tab and stack navigation          |
| **State**      | React Context + useReducer | Global state management           |
| **HTTP**       | Axios                      | API requests to Telegram          |
| **Storage**    | expo-file-system           | Local file caching & persistence  |
| **Images**     | expo-image-manipulator     | Resize/convert stickers           |
| **Sharing**    | expo-sharing               | Share stickers to WhatsApp        |
| **Build**      | EAS Build                  | Cloud APK/AAB generation          |

---

## User Journey Flowchart

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER JOURNEY                                        │
└─────────────────────────────────────────────────────────────────────────────────┘

                                    START
                                      │
                                      ▼
                              ┌───────────────┐
                              │  Open App     │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐     NO      ┌───────────────┐
                              │ Bot Token     │────────────▶│ Go to Settings│
                              │ Configured?   │             │ Enter Token   │
                              └───────┬───────┘             └───────┬───────┘
                                      │ YES                         │
                                      ▼                             │
                              ┌───────────────┐◀────────────────────┘
                              │ Home Screen   │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Tap "Import   │
                              │ from Telegram"│
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Enter pack    │
                              │ name or URL   │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Search &      │
                              │ Preview Pack  │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Select        │
                              │ Stickers      │
                              │ (min 3)       │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Download &    │
                              │ Convert       │
                              │ (512×512 WebP)│
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Save Pack     │
                              │ Locally       │
                              └───────┬───────┘
                                      │
                          ┌───────────┴───────────┐
                          │                       │
                          ▼                       ▼
                  ┌───────────────┐       ┌───────────────┐
                  │ Export Now    │       │ Export Later  │
                  └───────┬───────┘       └───────┬───────┘
                          │                       │
                          ▼                       ▼
                  ┌───────────────┐       ┌───────────────┐
                  │ WhatsApp      │       │ Saved Packs   │
                  │ Export Screen │       │ Screen        │
                  └───────┬───────┘       └───────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ Share to      │
                  │ WhatsApp      │
                  └───────┬───────┘
                          │
                          ▼
                        DONE ✓
```

---

## Sticker Requirements Summary

| Platform           | Size       | Format   | Max File Size | Min/Max per Pack |
| ------------------ | ---------- | -------- | ------------- | ---------------- |
| WhatsApp Sticker   | 512×512 px | WebP     | 100 KB        | 3-30 stickers    |
| WhatsApp Tray Icon | 96×96 px   | PNG      | -             | 1 per pack       |
| Telegram           | Varies     | WebP/TGS | -             | -                |

---

## Build & Deployment

### Development

```bash
npx expo start          # Start dev server
npx expo start --android  # Start with Android
```

### Production APK

```bash
eas build --platform android --profile preview
```

### Production AAB (Play Store)

```bash
eas build --platform android --profile production
```

---

_Generated for TransSticker v1.0.0_
