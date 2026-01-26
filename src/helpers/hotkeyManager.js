const { globalShortcut, app } = require("electron");
const debugLogger = require("./debugLogger");
const fs = require("fs");
const path = require("path");

// Suggested alternative hotkeys when registration fails
const SUGGESTED_HOTKEYS = {
  single: ["F8", "F9", "F10", "Pause", "ScrollLock"],
  compound: [
    "CommandOrControl+Shift+Space",
    "CommandOrControl+Shift+D",
    "Alt+Space",
    "CommandOrControl+`",
  ],
};

class HotkeyManager {
  constructor() {
    this.currentHotkey = "`";
    this.isInitialized = false;
    this.isListeningMode = false;
    this.configPath = null;
  }

  // Get path to hotkey config file in user data directory
  getConfigPath() {
    if (!this.configPath) {
      const userDataPath = app.getPath("userData");
      this.configPath = path.join(userDataPath, "hotkey-config.json");
    }
    return this.configPath;
  }

  // Save hotkey to config file (main process, always available)
  saveHotkeyToConfig(hotkey) {
    try {
      const configPath = this.getConfigPath();
      debugLogger.log(`[HotkeyManager] Attempting to save hotkey to: "${configPath}"`);
      const config = { dictationKey: hotkey, savedAt: new Date().toISOString() };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      debugLogger.log(`[HotkeyManager] Successfully saved hotkey to config file: "${hotkey}"`);
      return true;
    } catch (err) {
      debugLogger.error(`[HotkeyManager] Failed to save hotkey to config file: ${err.message}`);
      console.error("[HotkeyManager] Save error:", err);
      return false;
    }
  }

  // Load hotkey from config file (main process, always available)
  loadHotkeyFromConfig() {
    try {
      const configPath = this.getConfigPath();
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, "utf8");
        const config = JSON.parse(data);
        if (config.dictationKey && config.dictationKey.trim() !== "") {
          debugLogger.log(`[HotkeyManager] Loaded hotkey from config file: "${config.dictationKey}"`);
          return config.dictationKey;
        }
      }
    } catch (err) {
      debugLogger.error("[HotkeyManager] Failed to load hotkey from config file:", err);
    }
    return null;
  }

  setListeningMode(enabled) {
    this.isListeningMode = enabled;
    debugLogger.log(`[HotkeyManager] Listening mode: ${enabled ? "enabled" : "disabled"}`);
  }

  isInListeningMode() {
    return this.isListeningMode;
  }

  getFailureReason(hotkey) {
    if (globalShortcut.isRegistered(hotkey)) {
      return {
        reason: "already_registered",
        message: `"${hotkey}" is already registered by another application.`,
        suggestions: this.getSuggestions(hotkey),
      };
    }

    if (process.platform === "win32") {
      // Windows reserves certain keys
      const winReserved = ["PrintScreen", "Win", "Super"];
      if (winReserved.some((k) => hotkey.includes(k))) {
        return {
          reason: "os_reserved",
          message: `"${hotkey}" is reserved by Windows.`,
          suggestions: this.getSuggestions(hotkey),
        };
      }
    }

    if (process.platform === "linux") {
      // Linux DE's often reserve Super/Meta combinations
      if (hotkey.includes("Super") || hotkey.includes("Meta")) {
        return {
          reason: "os_reserved",
          message: `"${hotkey}" may be reserved by your desktop environment.`,
          suggestions: this.getSuggestions(hotkey),
        };
      }
    }

    return {
      reason: "registration_failed",
      message: `Could not register "${hotkey}". It may be in use by another application.`,
      suggestions: this.getSuggestions(hotkey),
    };
  }

  getSuggestions(failedHotkey) {
    const isCompound = failedHotkey.includes("+");
    const suggestions = isCompound
      ? [...SUGGESTED_HOTKEYS.compound]
      : [...SUGGESTED_HOTKEYS.single];

    return suggestions.filter((s) => s !== failedHotkey).slice(0, 3);
  }

  setupShortcuts(hotkey = "`", callback) {
    if (!callback) {
      throw new Error("Callback function is required for hotkey setup");
    }

    debugLogger.log(`[HotkeyManager] Setting up hotkey: "${hotkey}"`);
    debugLogger.log(`[HotkeyManager] Platform: ${process.platform}, Arch: ${process.arch}`);
    debugLogger.log(`[HotkeyManager] Current hotkey: "${this.currentHotkey}"`);

    // If we're already using this hotkey, just return success
    if (hotkey === this.currentHotkey) {
      debugLogger.log(
        `[HotkeyManager] Hotkey "${hotkey}" is already the current hotkey, no change needed`
      );
      return { success: true, hotkey };
    }

    // Unregister the previous hotkey (if it's not GLOBE, which doesn't use globalShortcut)
    if (this.currentHotkey && this.currentHotkey !== "GLOBE") {
      debugLogger.log(`[HotkeyManager] Unregistering previous hotkey: "${this.currentHotkey}"`);
      globalShortcut.unregister(this.currentHotkey);
    }

    try {
      if (hotkey === "GLOBE") {
        if (process.platform !== "darwin") {
          debugLogger.log("[HotkeyManager] GLOBE key rejected - not on macOS");
          return {
            success: false,
            error: "The Globe key is only available on macOS.",
          };
        }
        this.currentHotkey = hotkey;
        debugLogger.log("[HotkeyManager] GLOBE key set successfully");
        return { success: true, hotkey };
      }

      const alreadyRegistered = globalShortcut.isRegistered(hotkey);
      debugLogger.log(`[HotkeyManager] Is "${hotkey}" already registered? ${alreadyRegistered}`);

      if (process.platform === "linux") {
        globalShortcut.unregister(hotkey);
      }

      const success = globalShortcut.register(hotkey, callback);
      debugLogger.log(`[HotkeyManager] Registration result for "${hotkey}": ${success}`);

      if (success) {
        this.currentHotkey = hotkey;
        debugLogger.log(`[HotkeyManager] Hotkey "${hotkey}" registered successfully`);
        return { success: true, hotkey };
      } else {
        const failureInfo = this.getFailureReason(hotkey);
        console.error(`[HotkeyManager] Failed to register hotkey: ${hotkey}`, failureInfo);
        debugLogger.log(`[HotkeyManager] Registration failed:`, failureInfo);

        let errorMessage = failureInfo.message;
        if (failureInfo.suggestions.length > 0) {
          errorMessage += ` Try: ${failureInfo.suggestions.join(", ")}`;
        }

        return {
          success: false,
          error: errorMessage,
          reason: failureInfo.reason,
          suggestions: failureInfo.suggestions,
        };
      }
    } catch (error) {
      console.error("[HotkeyManager] Error setting up shortcuts:", error);
      debugLogger.log(`[HotkeyManager] Exception during registration:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async initializeHotkey(mainWindow, callback) {
    if (!mainWindow || !callback) {
      throw new Error("mainWindow and callback are required");
    }

    this.mainWindow = mainWindow;
    this.pendingCallback = callback;

    if (process.platform === "linux") {
      globalShortcut.unregisterAll();
    }

    debugLogger.log("[HotkeyManager] initializeHotkey called");

    // FIRST: Try to load and register hotkey from config file immediately
    // This is available right away without waiting for renderer
    const savedHotkey = this.loadHotkeyFromConfig();
    
    if (savedHotkey) {
      debugLogger.log(`[HotkeyManager] Found saved hotkey in config: "${savedHotkey}"`);
      const result = this.setupShortcuts(savedHotkey, callback);
      if (result.success) {
        debugLogger.log(`[HotkeyManager] Successfully registered saved hotkey: "${savedHotkey}"`);
        this.isInitialized = true;
        return;
      }
      debugLogger.log(`[HotkeyManager] Failed to register saved hotkey: ${result.error}`);
    } else {
      debugLogger.log("[HotkeyManager] No saved hotkey in config file");
    }

    // FALLBACK: Register default hotkey
    const defaultHotkey = process.platform === "darwin" ? "GLOBE" : "`";
    
    if (defaultHotkey === "GLOBE") {
      this.currentHotkey = "GLOBE";
      debugLogger.log("[HotkeyManager] Using GLOBE key as default on macOS");
      this.isInitialized = true;
      return;
    }

    const result = this.setupShortcuts(defaultHotkey, callback);
    if (result.success) {
      debugLogger.log(`[HotkeyManager] Default hotkey "${defaultHotkey}" registered successfully`);
    } else {
      debugLogger.log(`[HotkeyManager] Default hotkey failed, trying fallbacks...`);
      const fallbackHotkeys = ["F8", "F9", "CommandOrControl+Shift+Space"];
      
      for (const fallback of fallbackHotkeys) {
        const fallbackResult = this.setupShortcuts(fallback, callback);
        if (fallbackResult.success) {
          debugLogger.log(`[HotkeyManager] Fallback hotkey "${fallback}" registered`);
          this.saveHotkeyToConfig(fallback);
          break;
        }
      }
    }

    this.isInitialized = true;
  }

  async loadSavedHotkeyOrDefault(mainWindow, callback) {
    try {
      debugLogger.log("[HotkeyManager] loadSavedHotkeyOrDefault - attempting to read localStorage");
      
      const savedHotkey = await mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            const key = localStorage.getItem("dictationKey");
            console.log("[HotkeyManager] localStorage dictationKey:", key);
            return key || "";
          } catch (e) {
            console.error("[HotkeyManager] Error reading localStorage:", e);
            return "";
          }
        })()
      `);

      debugLogger.log(`[HotkeyManager] Read savedHotkey from localStorage: "${savedHotkey}"`);

      if (savedHotkey && savedHotkey.trim() !== "") {
        debugLogger.log(`[HotkeyManager] Attempting to register saved hotkey: "${savedHotkey}"`);
        const result = this.setupShortcuts(savedHotkey, callback);
        if (result.success) {
          debugLogger.log(`[HotkeyManager] Restored saved hotkey: "${savedHotkey}"`);
          return;
        }
        debugLogger.log(`[HotkeyManager] Saved hotkey "${savedHotkey}" failed to register, error: ${result.error}`);
        this.notifyHotkeyFailure(savedHotkey, result);
      } else {
        debugLogger.log("[HotkeyManager] No saved hotkey found in localStorage");
      }

      const defaultHotkey = process.platform === "darwin" ? "GLOBE" : "`";

      if (defaultHotkey === "GLOBE") {
        this.currentHotkey = "GLOBE";
        debugLogger.log("[HotkeyManager] Using GLOBE key as default on macOS");
        return;
      }

      const result = this.setupShortcuts(defaultHotkey, callback);
      if (result.success) {
        debugLogger.log(
          `[HotkeyManager] Default hotkey "${defaultHotkey}" registered successfully`
        );
        return;
      }

      debugLogger.log(
        `[HotkeyManager] Default hotkey "${defaultHotkey}" failed, trying fallbacks...`
      );
      const fallbackHotkeys = ["F8", "F9", "CommandOrControl+Shift+Space"];

      for (const fallback of fallbackHotkeys) {
        const fallbackResult = this.setupShortcuts(fallback, callback);
        if (fallbackResult.success) {
          debugLogger.log(`[HotkeyManager] Fallback hotkey "${fallback}" registered successfully`);
          // Save the working fallback to localStorage
          this.saveHotkeyToRenderer(fallback);
          // Notify renderer about the fallback
          this.notifyHotkeyFallback(defaultHotkey, fallback);
          return;
        }
      }

      debugLogger.log("[HotkeyManager] All hotkey fallbacks failed");
      this.notifyHotkeyFailure(defaultHotkey, result);
    } catch (err) {
      console.error("Failed to initialize hotkey:", err);
      debugLogger.error("[HotkeyManager] Failed to initialize hotkey:", err);
    }
  }

  saveHotkeyToRenderer(hotkey) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents
        .executeJavaScript(
          `
        localStorage.setItem("dictationKey", "${hotkey}");
      `
        )
        .catch((err) => {
          debugLogger.error("[HotkeyManager] Failed to save hotkey to localStorage:", err);
        });
    }
  }

  notifyHotkeyFallback(originalHotkey, fallbackHotkey) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("hotkey-fallback-used", {
        original: originalHotkey,
        fallback: fallbackHotkey,
        message: `The "${originalHotkey}" key was unavailable. Using "${fallbackHotkey}" instead. You can change this in Settings.`,
      });
    }
  }

  notifyHotkeyFailure(hotkey, result) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("hotkey-registration-failed", {
        hotkey,
        error: result?.error || `Could not register "${hotkey}"`,
        suggestions: result?.suggestions || ["F8", "F9", "CommandOrControl+Shift+Space"],
      });
    }
  }

  async updateHotkey(hotkey, callback) {
    debugLogger.log(`[HotkeyManager] updateHotkey called with: "${hotkey}"`);
    
    if (!callback) {
      throw new Error("Callback function is required for hotkey update");
    }

    try {
      const result = this.setupShortcuts(hotkey, callback);
      debugLogger.log(`[HotkeyManager] setupShortcuts result: ${JSON.stringify(result)}`);
      
      if (result.success) {
        // Save to BOTH config file (main process) and localStorage (renderer)
        const configSaved = this.saveHotkeyToConfig(hotkey);
        debugLogger.log(`[HotkeyManager] Config file saved: ${configSaved}`);
        this.saveHotkeyToRenderer(hotkey);
        return { success: true, message: `Hotkey updated to: ${hotkey}` };
      } else {
        return {
          success: false,
          message: result.error,
          suggestions: result.suggestions,
        };
      }
    } catch (error) {
      console.error("Failed to update hotkey:", error);
      debugLogger.error(`[HotkeyManager] updateHotkey error: ${error.message}`);
      return {
        success: false,
        message: `Failed to update hotkey: ${error.message}`,
      };
    }
  }

  getCurrentHotkey() {
    return this.currentHotkey;
  }

  unregisterAll() {
    globalShortcut.unregisterAll();
  }

  isHotkeyRegistered(hotkey) {
    return globalShortcut.isRegistered(hotkey);
  }
}

module.exports = HotkeyManager;
