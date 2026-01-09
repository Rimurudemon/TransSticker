import React, { createContext, useContext, useReducer, useEffect } from "react";
import * as FileSystem from "expo-file-system";

// Initial state
const initialState = {
  telegramBotToken: "",
  savedPacks: [],
  currentPack: null,
  isLoading: false,
  error: null,
};

// Actions
const SET_BOT_TOKEN = "SET_BOT_TOKEN";
const SET_SAVED_PACKS = "SET_SAVED_PACKS";
const ADD_SAVED_PACK = "ADD_SAVED_PACK";
const REMOVE_SAVED_PACK = "REMOVE_SAVED_PACK";
const SET_CURRENT_PACK = "SET_CURRENT_PACK";
const SET_LOADING = "SET_LOADING";
const SET_ERROR = "SET_ERROR";

// Reducer
function stickerReducer(state, action) {
  switch (action.type) {
    case SET_BOT_TOKEN:
      return { ...state, telegramBotToken: action.payload };
    case SET_SAVED_PACKS:
      return { ...state, savedPacks: action.payload };
    case ADD_SAVED_PACK:
      return { ...state, savedPacks: [...state.savedPacks, action.payload] };
    case REMOVE_SAVED_PACK:
      return {
        ...state,
        savedPacks: state.savedPacks.filter(
          (pack) => pack.id !== action.payload
        ),
      };
    case SET_CURRENT_PACK:
      return { ...state, currentPack: action.payload };
    case SET_LOADING:
      return { ...state, isLoading: action.payload };
    case SET_ERROR:
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

// Context
const StickerContext = createContext();

// Storage keys
const STORAGE_DIR = FileSystem.documentDirectory + "transsticker/";
const CONFIG_FILE = STORAGE_DIR + "config.json";
const PACKS_FILE = STORAGE_DIR + "saved_packs.json";

// Provider component
export function StickerProvider({ children }) {
  const [state, dispatch] = useReducer(stickerReducer, initialState);

  // Initialize storage and load saved data
  useEffect(() => {
    initializeStorage();
  }, []);

  const initializeStorage = async () => {
    try {
      // Create storage directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(STORAGE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(STORAGE_DIR, {
          intermediates: true,
        });
      }

      // Load config
      const configInfo = await FileSystem.getInfoAsync(CONFIG_FILE);
      if (configInfo.exists) {
        const configData = await FileSystem.readAsStringAsync(CONFIG_FILE);
        const config = JSON.parse(configData);
        dispatch({
          type: SET_BOT_TOKEN,
          payload: config.telegramBotToken || "",
        });
      }

      // Load saved packs
      const packsInfo = await FileSystem.getInfoAsync(PACKS_FILE);
      if (packsInfo.exists) {
        const packsData = await FileSystem.readAsStringAsync(PACKS_FILE);
        const packs = JSON.parse(packsData);
        dispatch({ type: SET_SAVED_PACKS, payload: packs });
      }
    } catch (error) {
      console.error("Error initializing storage:", error);
    }
  };

  // Save bot token
  const setBotToken = async (token) => {
    try {
      dispatch({ type: SET_BOT_TOKEN, payload: token });
      await FileSystem.writeAsStringAsync(
        CONFIG_FILE,
        JSON.stringify({ telegramBotToken: token })
      );
    } catch (error) {
      console.error("Error saving bot token:", error);
    }
  };

  // Save a sticker pack
  const savePack = async (pack) => {
    try {
      const newPack = {
        ...pack,
        id: Date.now().toString(),
        savedAt: new Date().toISOString(),
      };
      dispatch({ type: ADD_SAVED_PACK, payload: newPack });

      const updatedPacks = [...state.savedPacks, newPack];
      await FileSystem.writeAsStringAsync(
        PACKS_FILE,
        JSON.stringify(updatedPacks)
      );

      return newPack;
    } catch (error) {
      console.error("Error saving pack:", error);
      throw error;
    }
  };

  // Remove a saved pack
  const removePack = async (packId) => {
    try {
      dispatch({ type: REMOVE_SAVED_PACK, payload: packId });

      const updatedPacks = state.savedPacks.filter(
        (pack) => pack.id !== packId
      );
      await FileSystem.writeAsStringAsync(
        PACKS_FILE,
        JSON.stringify(updatedPacks)
      );
    } catch (error) {
      console.error("Error removing pack:", error);
      throw error;
    }
  };

  // Set current pack for viewing/editing
  const setCurrentPack = (pack) => {
    dispatch({ type: SET_CURRENT_PACK, payload: pack });
  };

  // Set loading state
  const setLoading = (isLoading) => {
    dispatch({ type: SET_LOADING, payload: isLoading });
  };

  // Set error
  const setError = (error) => {
    dispatch({ type: SET_ERROR, payload: error });
  };

  const value = {
    ...state,
    setBotToken,
    savePack,
    removePack,
    setCurrentPack,
    setLoading,
    setError,
  };

  return (
    <StickerContext.Provider value={value}>{children}</StickerContext.Provider>
  );
}

// Custom hook to use the context
export function useStickers() {
  const context = useContext(StickerContext);
  if (!context) {
    throw new Error("useStickers must be used within a StickerProvider");
  }
  return context;
}
