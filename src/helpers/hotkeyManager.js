const { globalShortcut, app } = require("electron");
const debugLogger = require("./debugLogger");
const fs = require("fs");
const path = require("path");
const GnomeShortcutManager = require("./gnomeShortcut");

// Delay to ensure localStorage is accessible after window load
const HOTKEY_REGISTRATION_DELAY_MS = 1000;

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
    this.gnomeManager = null;
    this.useGnome = false;
    this.hotkeyCallback = null;
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

    // If we're already using this hotkey AND it's actually registered, return success
    // Note: We need to check isRegistered because on first run, currentHotkey is set to "`"
    // but it's not actually registered yet
    if (
      hotkey === this.currentHotkey &&
      hotkey !== "GLOBE" &&
      globalShortcut.isRegistered(hotkey)
    ) {
      debugLogger.log(
        `[HotkeyManager] Hotkey "${hotkey}" is already the current hotkey and registered, no change needed`
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

  async initializeGnomeShortcuts(callback) {
    if (process.platform !== "linux" || !GnomeShortcutManager.isWayland()) {
      return false;
    }

    if (GnomeShortcutManager.isGnome()) {
      try {
        this.gnomeManager = new GnomeShortcutManager();

        const dbusOk = await this.gnomeManager.initDBusService(callback);
        if (dbusOk) {
          this.useGnome = true;
          this.hotkeyCallback = callback;
          return true;
        }
      } catch (err) {
        debugLogger.log("[HotkeyManager] GNOME shortcut init failed:", err.message);
        this.gnomeManager = null;
        this.useGnome = false;
      }
    }

    return false;
  }

  async initializeHotkey(mainWindow, callback) {
    if (!mainWindow || !callback) {
      throw new Error("mainWindow and callback are required");
    }

    this.mainWindow = mainWindow;
    this.hotkeyCallback = callback;

    if (process.platform === "linux" && GnomeShortcutManager.isWayland()) {
      const gnomeOk = await this.initializeGnomeShortcuts(callback);

      if (gnomeOk) {
        const registerGnomeHotkey = async () => {
          try {
            // Try config file first, then localStorage
            let savedHotkey = this.loadHotkeyFromConfig();
            if (!savedHotkey) {
              savedHotkey = await mainWindow.webContents.executeJavaScript(`
                localStorage.getItem("dictationKey") || ""
              `);
            }
            const hotkey = savedHotkey && savedHotkey.trim() !== "" ? savedHotkey : "Alt+R";
            const gnomeHotkey = GnomeShortcutManager.convertToGnomeFormat(hotkey);

            const success = await this.gnomeManager.registerKeybinding(gnomeHotkey);
            if (success) {
              this.currentHotkey = hotkey;
              debugLogger.log(`[HotkeyManager] GNOME hotkey "${hotkey}" registered successfully`);
            } else {
              debugLogger.log("[HotkeyManager] GNOME keybinding failed, falling back to X11");
              this.useGnome = false;
              this.loadSavedHotkeyOrDefault(mainWindow, callback);
            }
          } catch (err) {
            debugLogger.log(
              "[HotkeyManager] GNOME keybinding failed, falling back to X11:",
              err.message
            );
            this.useGnome = false;
            this.loadSavedHotkeyOrDefault(mainWindow, callback);
          }
        };

        setTimeout(registerGnomeHotkey, HOTKEY_REGISTRATION_DELAY_MS);
        this.isInitialized = true;
        return;
      }
    }

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

    // FALLBACK: Use setTimeout to ensure localStorage is ready
    setTimeout(() => {
      this.loadSavedHotkeyOrDefault(mainWindow, callback);
    }, HOTKEY_REGISTRATION_DELAY_MS);

    this.isInitialized = true;
  }

  async loadSavedHotkeyOrDefault(mainWindow, callback) {
    try {
      debugLogger.log("[HotkeyManager] loadSavedHotkeyOrDefault - attempting to read localStorage");
      
      // Try config file first, then localStorage
      let savedHotkey = this.loadHotkeyFromConfig();
      if (!savedHotkey) {
        savedHotkey = await mainWindow.webContents.executeJavaScript(`
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
      }
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
          await this.saveHotkeyToRenderer(fallback);
          this.notifyHotkeyFallback(defaultHotkey, fallback);
          return;
        }
      }

      debugLogger.log("[HotkeyManager] All hotkey fallbacks failed");
      this.notifyHotkeyFailure(defaultHotkey, result);
    } catch (err) {
      console.error("Failed to initialize hotkey:", err);
      debugLogger.error("[HotkeyManager] Failed to initialize hotkey:", err.message);
    }
  }

  async saveHotkeyToRenderer(hotkey) {
    // Escape the hotkey string to prevent injection issues
    const escapedHotkey = hotkey.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        await this.mainWindow.webContents.executeJavaScript(
          `localStorage.setItem("dictationKey", "${escapedHotkey}"); true;`
        );
        debugLogger.log(`[HotkeyManager] Saved hotkey "${hotkey}" to localStorage`);
        return true;
      } catch (err) {
        debugLogger.error("[HotkeyManager] Failed to save hotkey to localStorage:", err.message);
        return false;
      }
    } else {
      debugLogger.warn("[HotkeyManager] Main window not available for saving hotkey");
      return false;
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
      if (this.useGnome && this.gnomeManager) {
        debugLogger.log(`[HotkeyManager] Updating GNOME hotkey to "${hotkey}"`);
        const gnomeHotkey = GnomeShortcutManager.convertToGnomeFormat(hotkey);
        const success = await this.gnomeManager.updateKeybinding(gnomeHotkey);
        if (!success) {
          return {
            success: false,
            message: `Failed to update GNOME hotkey to "${hotkey}". Check the format is valid.`,
          };
        }
        this.currentHotkey = hotkey;
        const saved = await this.saveHotkeyToRenderer(hotkey);
        if (!saved) {
          debugLogger.warn(
            "[HotkeyManager] GNOME hotkey registered but failed to persist to localStorage"
          );
        }
        return {
          success: true,
          message: `Hotkey updated to: ${hotkey} (via GNOME native shortcut)`,
        };
      }

      const result = this.setupShortcuts(hotkey, callback);
      debugLogger.log(`[HotkeyManager] setupShortcuts result: ${JSON.stringify(result)}`);
      
      if (result.success) {
        // Save to BOTH config file (main process) and localStorage (renderer)
        const configSaved = this.saveHotkeyToConfig(hotkey);
        debugLogger.log(`[HotkeyManager] Config file saved: ${configSaved}`);
        const saved = await this.saveHotkeyToRenderer(hotkey);
        if (!saved) {
          debugLogger.warn(
            "[HotkeyManager] Hotkey registered but failed to persist to localStorage"
          );
        }
        return { success: true, message: `Hotkey updated to: ${hotkey}` };
      } else {
        return {
          success: false,
          message: result.error,
          suggestions: result.suggestions,
        };
      }
    } catch (error) {
      debugLogger.error("[HotkeyManager] Failed to update hotkey:", error.message);
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
    if (this.gnomeManager) {
      this.gnomeManager.unregisterKeybinding().catch((err) => {
        debugLogger.warn("[HotkeyManager] Error unregistering GNOME keybinding:", err.message);
      });
      this.gnomeManager.close();
      this.gnomeManager = null;
      this.useGnome = false;
    }
    globalShortcut.unregisterAll();
  }

  isUsingGnome() {
    return this.useGnome;
  }

  isHotkeyRegistered(hotkey) {
    return globalShortcut.isRegistered(hotkey);
  }
}

module.exports = HotkeyManager;
