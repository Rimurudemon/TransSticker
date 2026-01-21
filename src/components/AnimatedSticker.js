import React, { useState, useEffect } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Video, ResizeMode } from "expo-av";
import LottieView from "lottie-react-native";
import * as FileSystem from "expo-file-system/legacy";
import LottieConverter from "../utils/LottieConverter";
import { useStickers } from "../context/StickerContext";

const converter = new LottieConverter();
const tgsCache = new Map(); // Simple memory cache for parsed Lottie JSON

export default function AnimatedSticker({
  sticker,
  style,
  resizeMode = "contain",
  playing = true,
  source = "telegram", // "telegram" or "local"
}) {
  const [lottieJson, setLottieJson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const { is_animated, is_video, file_id, localPath, file_url, thumbnail } =
    sticker;

  // Determine actual type based on file extension first (since files are converted when saved)
  // Extension takes priority over pack-level flags because stickers are converted to WebP format
  const isWebp = localPath && localPath.endsWith(".webp");
  const isWebm = localPath && localPath.endsWith(".webm");
  const isTgsFile = localPath && localPath.endsWith(".tgs");
  
  // Only treat as TGS if it's actually a .tgs file, or if is_animated flag is set AND no local file exists yet
  const isTgs = isTgsFile || (!localPath && is_animated);
  // Only treat as WebM if it's actually a .webm file, or if is_video flag is set AND no local file exists yet  
  const isVideo = isWebm || (!localPath && is_video);

  // URL to use
  const uri = localPath || file_url;

  useEffect(() => {
    let mounted = true;

    const loadTgs = async () => {
      if (!isTgs || !uri) return;

      // Check cache first
      if (tgsCache.has(uri)) {
        setLottieJson(tgsCache.get(uri));
        return;
      }

      try {
        setLoading(true);
        let validUri = uri;

        // If remote TGS, we must download it first to decompress
        if (uri.startsWith("http")) {
          // Create a temp path in cache
          const filename = uri.split("/").pop();
          const tempDir = FileSystem.cacheDirectory + "tgs_cache/";
          const tempPath = tempDir + filename;

          const dirInfo = await FileSystem.getInfoAsync(tempDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(tempDir, {
              intermediates: true,
            });
          }

          // Check if already downloaded
          const fileInfo = await FileSystem.getInfoAsync(tempPath);
          let targetPath = tempPath;

          if (!fileInfo.exists) {
            // Download
            const result = await FileSystem.downloadAsync(uri, tempPath);
            targetPath = result.uri;
          }

          // Now decompress local file
          validUri = targetPath;
        }

        // Local TGS
        const json = await converter.decompressTgs(validUri);
        if (mounted) {
          tgsCache.set(uri, json);
          setLottieJson(json);
        }
      } catch (err) {
        console.warn("Failed to load TGS:", err);
        setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (isTgs && !lottieJson) {
      loadTgs();
    }

    return () => {
      mounted = false;
    };
  }, [uri, isTgs]);

  if (error) {
    return (
      <Image
        source={{ uri: thumbnail || file_url }} // Fallback to thumbnail
        style={style}
        contentFit={resizeMode}
      />
    );
  }

  // 1. TGS (Lottie)
  if (isTgs && lottieJson) {
    return (
      <LottieView
        source={lottieJson}
        autoPlay={playing}
        loop={true}
        style={style}
        resizeMode={resizeMode === "contain" ? "contain" : "cover"}
      />
    );
  }

  // 2. WebM (Video)
  if (isVideo) {
    return (
      <Video
        source={{ uri }}
        style={style}
        resizeMode={
          resizeMode === "contain" ? ResizeMode.CONTAIN : ResizeMode.COVER
        }
        isLooping
        shouldPlay={playing}
        isMuted={true}
      />
    );
  }

  // 3. WebP (Animated/Static)
  // Expo Image handles animated WebP natively
  return (
    <Image
      source={{ uri: uri || thumbnail }}
      style={style}
      contentFit={resizeMode}
      transition={200}
      cachePolicy="disk"
      // animated={playing} // expo-image plays by default
    />
  );
}

const styles = StyleSheet.create({
  loader: {
    position: "absolute",
    alignSelf: "center",
  },
});
