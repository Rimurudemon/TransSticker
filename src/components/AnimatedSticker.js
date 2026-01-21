import React, { useState, useEffect, useRef } from "react";
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
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef(null);

  const { is_animated, is_video, file_id, localPath, file_url, thumbnail } =
    sticker;

  // Get the URI to use - prefer localPath for saved stickers, file_url for remote
  const uri = localPath || file_url;
  
  // Helper to check file extension from any path/url
  const getExtension = (path) => {
    if (!path) return null;
    const match = path.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
    return match ? match[1].toLowerCase() : null;
  };
  
  // Check extension from localPath first, then file_url
  const ext = getExtension(localPath) || getExtension(file_url);
  
  // Determine actual type based on file extension first
  const isWebpByExt = ext === "webp";
  const isWebmByExt = ext === "webm";
  const isTgsByExt = ext === "tgs";
  
  // For type detection: extension wins, then flags
  // If we have a converted local WebP, treat it as WebP regardless of flags
  const isTgs = isTgsByExt || (!localPath && !ext && is_animated);
  const isVideoSticker = isWebmByExt || (!localPath && !ext && is_video);
  const isWebp = isWebpByExt || (!isTgs && !isVideoSticker);

  // Reset video states when URI changes
  useEffect(() => {
    setVideoReady(false);
    setVideoError(false);
  }, [uri]);

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

  // Render thumbnail with optional loading indicator
  const renderThumbnail = (showLoader = true) => (
    <View style={[style, styles.loadingContainer]}>
      <Image
        source={{ uri: thumbnail || file_url }}
        style={StyleSheet.absoluteFill}
        contentFit={resizeMode}
      />
      {showLoader && (
        <ActivityIndicator 
          color="#6C63FF" 
          size="small" 
          style={styles.loader}
        />
      )}
    </View>
  );

  // Show loading state with thumbnail placeholder for TGS
  if (loading || (isTgs && !lottieJson && !error)) {
    return renderThumbnail(true);
  }

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

  // 2. WebM (Video) - Show thumbnail until video is ready
  if (isVideoSticker) {
    // If video failed to load (codec error), just show thumbnail
    if (videoError) {
      return (
        <View style={[style, styles.videoContainer]}>
          <Image
            source={{ uri: thumbnail || file_url }}
            style={StyleSheet.absoluteFill}
            contentFit={resizeMode}
          />
          {/* Show play icon to indicate it's a video */}
          <View style={styles.playIconContainer}>
            <View style={styles.playIcon} />
          </View>
        </View>
      );
    }
    
    return (
      <View style={[style, styles.videoContainer]}>
        {/* Always render thumbnail behind video */}
        <Image
          source={{ uri: thumbnail || file_url }}
          style={StyleSheet.absoluteFill}
          contentFit={resizeMode}
        />
        
        {/* Video loads on top, becomes visible when ready */}
        <Video
          ref={videoRef}
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { opacity: videoReady ? 1 : 0 }]}
          resizeMode={
            resizeMode === "contain" ? ResizeMode.CONTAIN : ResizeMode.COVER
          }
          isLooping
          shouldPlay={playing}
          isMuted={true}
          onReadyForDisplay={() => setVideoReady(true)}
          onError={(err) => {
            console.warn("Video codec not supported, falling back to thumbnail");
            setVideoError(true);
          }}
        />
        
        {/* Show loading indicator while video loads */}
        {!videoReady && (
          <ActivityIndicator 
            color="#6C63FF" 
            size="small" 
            style={styles.loader}
          />
        )}
      </View>
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
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  videoContainer: {
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  loader: {
    position: "absolute",
    alignSelf: "center",
  },
  playIconContainer: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderLeftWidth: 10,
    borderLeftColor: "#fff",
    borderTopWidth: 6,
    borderTopColor: "transparent",
    borderBottomWidth: 6,
    borderBottomColor: "transparent",
  },
});
