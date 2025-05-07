// background/background.js
console.log("background.js loaded and running");

const DEFAULT_SETTINGS = Object.freeze({
  compressor: {
    threshold: -24, // dB
    ratio: 12,      // unitless
    attack: 0.02,   // seconds (20ms)
    release: 0.25,  // seconds (250ms)
    knee: 30        // dB
  },
  limiter: {
    threshold: -3,  // dB
    attack: 0.001,  // seconds (1ms)
    release: 0.05,  // seconds (50ms)
    ratio: 20,      // unitless (high for limiting)
    knee: 0         // dB (hard knee for limiting)
  },
  amplifier: {
    gain: 0         // dB
  }
});

let currentSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); // Deep copy for mutable current settings

let activeTabId = null;
let audioProcessorPresentInActiveTab = false;

// Load settings from storage on startup
chrome.storage.local.get('audioSettings', (data) => {
  if (data.audioSettings) {
    // Basic validation/merge to ensure all keys from DEFAULT_SETTINGS are present
    // This prevents errors if stored settings are old/incomplete.
    let loadedSettings = data.audioSettings;
    for (const type in DEFAULT_SETTINGS) {
        if (!loadedSettings[type]) loadedSettings[type] = {};
        for (const param in DEFAULT_SETTINGS[type]) {
            if (loadedSettings[type][param] === undefined) {
                loadedSettings[type][param] = DEFAULT_SETTINGS[type][param];
            }
        }
    }
    currentSettings = loadedSettings;
    console.log("Loaded settings from storage:", currentSettings);
  } else {
    // If nothing in storage, ensure currentSettings (already defaulted) is saved.
    chrome.storage.local.set({ audioSettings: currentSettings }, () => {
        console.log("Initialized storage with default settings as none were found.");
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("Audio Manager extension installed.");
  // Ensure default settings are in storage if not already there (covered by the load logic above too)
  chrome.storage.local.get('audioSettings', (data) => {
    if (!data.audioSettings) {
      chrome.storage.local.set({ audioSettings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) }, () => {
        console.log("Default settings saved to storage on install.");
      });
    }
  });
});

function applyAndStoreSettings(newSettings) {
  currentSettings = newSettings;
  chrome.storage.local.set({ audioSettings: currentSettings }, () => {
    console.log("Settings saved to storage:", currentSettings);
  });
  if (activeTabId && audioProcessorPresentInActiveTab) {
    chrome.tabs.sendMessage(activeTabId, {
      action: 'applySettings',
      settings: currentSettings
    }).catch(error => console.warn("Error sending 'applySettings' to content script:", error.message));
    console.log("Relayed 'applySettings' to active tab:", activeTabId);
  } else {
    console.log("No active tab/processor, settings stored but not relayed immediately.");
  }
}

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background script received message:", message, "from sender:", sender);

  switch (message.action) {
    case 'getSettings':
      sendResponse({ status: "success", settings: currentSettings });
      console.log("Sent current settings to popup:", currentSettings);
      break;

    case 'updateSetting':
      if (message.settingType && message.parameter !== undefined && message.value !== undefined) {
        if (currentSettings[message.settingType]) {
          let newSettings = JSON.parse(JSON.stringify(currentSettings)); // Deep copy
          newSettings[message.settingType][message.parameter] = message.value;
          applyAndStoreSettings(newSettings);
          console.log(`Updated setting: ${message.settingType}.${message.parameter} = ${message.value}`);
          sendResponse({ status: "success", settings: currentSettings }); // Send back the updated settings
        } else {
          console.error("Invalid settingType in updateSetting message:", message.settingType);
          sendResponse({ status: "error", message: "Invalid setting type" });
        }
      } else {
        console.error("Invalid updateSetting message structure:", message);
        sendResponse({ status: "error", message: "Invalid message structure for updateSetting" });
      }
      break;

    case 'resetToDefaults':
      console.log("Resetting settings to defaults.");
      applyAndStoreSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
      sendResponse({ status: "success", settings: currentSettings }); // currentSettings is now defaults
      console.log("Settings reset to defaults and applied.");
      break;

    case 'audioProcessorReady':
      activeTabId = sender.tab.id;
      audioProcessorPresentInActiveTab = true;
      console.log(`Audio processor reported ready in tab: ${activeTabId}. Sending current settings.`);
      chrome.tabs.sendMessage(activeTabId, {
        action: 'applySettings',
        settings: currentSettings
      }).catch(error => console.warn("Error sending initial 'applySettings' to content script:", error.message));
      sendResponse({ status: "success", message: "Background noted audio processor ready." });
      break;

    case 'audioProcessorRemoved':
      if (sender.tab.id === activeTabId) {
        activeTabId = null;
        audioProcessorPresentInActiveTab = false;
        console.log(`Audio processor removed or tab closed: ${sender.tab.id}. Active tab cleared.`);
      }
      sendResponse({ status: "success", message: "Background noted audio processor removed." });
      break;

    default:
      console.warn("Unknown message action received:", message.action);
      sendResponse({ status: "error", message: `Unknown action: ${message.action}` });
      break;
  }
  return true; // Indicates that sendResponse will be called asynchronously for some cases
});

// Handle tab closures or updates to clear activeTabId if necessary
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === activeTabId) {
    activeTabId = null;
    audioProcessorPresentInActiveTab = false;
    console.log(`Active tab ${tabId} was removed. Active tab cleared.`);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === activeTabId && (changeInfo.status === 'loading' || changeInfo.url)) {
      console.log(`Active tab ${tabId} updated (status: ${changeInfo.status}, url changed: ${!!changeInfo.url}). Content script state will be reset.`);
      audioProcessorPresentInActiveTab = false; 
  }
});

console.log("Background script event listeners set up.");
