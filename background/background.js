// background/background.js
console.log("background.js loaded and running");

const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  compressor: { threshold: -24, ratio: 12, attack: 0.02, release: 0.25, knee: 30 },
  limiter: { threshold: -3, attack: 0.001, release: 0.05, ratio: 20, knee: 0 },
  amplifier: { gain: 0 }
});

const DEFAULT_EXTENSION_STATE = Object.freeze({
  isExtensionEnabled: true
});

let currentAudioSettings = JSON.parse(JSON.stringify(DEFAULT_AUDIO_SETTINGS));
let currentExtensionState = JSON.parse(JSON.stringify(DEFAULT_EXTENSION_STATE));

let activeTabId = null;
let audioProcessorPresentInActiveTab = false;

// Load settings from storage on startup
Promise.all([
  chrome.storage.local.get('audioSettings').then(data => {
    if (data.audioSettings) {
      let loaded = data.audioSettings;
      for (const type in DEFAULT_AUDIO_SETTINGS) {
        if (!loaded[type]) loaded[type] = {};
        for (const param in DEFAULT_AUDIO_SETTINGS[type]) {
          if (loaded[type][param] === undefined) loaded[type][param] = DEFAULT_AUDIO_SETTINGS[type][param];
        }
      }
      currentAudioSettings = loaded;
      console.log("Loaded audio settings:", currentAudioSettings);
    } else {
      chrome.storage.local.set({ audioSettings: DEFAULT_AUDIO_SETTINGS });
    }
  }),
  chrome.storage.local.get('extensionGlobalState').then(data => {
    if (data.extensionGlobalState && data.extensionGlobalState.isExtensionEnabled !== undefined) {
      currentExtensionState = data.extensionGlobalState;
      console.log("Loaded extension state:", currentExtensionState);
    } else {
      chrome.storage.local.set({ extensionGlobalState: DEFAULT_EXTENSION_STATE });
    }
  })
]).catch(error => console.error("Error loading settings from storage:", error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("Audio Manager extension installed.");
  chrome.storage.local.set({ audioSettings: DEFAULT_AUDIO_SETTINGS });
  chrome.storage.local.set({ extensionGlobalState: DEFAULT_EXTENSION_STATE });
});

function applyAndStoreAudioSettings(newSettings) {
  currentAudioSettings = newSettings;
  chrome.storage.local.set({ audioSettings: currentAudioSettings });
  if (activeTabId && audioProcessorPresentInActiveTab && currentExtensionState.isExtensionEnabled) {
    chrome.tabs.sendMessage(activeTabId, { 
        action: 'applyAudioSettings',
        settings: currentAudioSettings 
    }).catch(e => console.warn("Error sending 'applyAudioSettings' to content script:", e.message));
  }
}

function broadcastExtensionState() {
  if (activeTabId && audioProcessorPresentInActiveTab) {
    chrome.tabs.sendMessage(activeTabId, {
        action: 'setAudioEffectsEnabled',
        enable: currentExtensionState.isExtensionEnabled 
    }).catch(e => console.warn("Error broadcasting setAudioEffectsEnabled to content script:", e.message));
  } else {
    console.log("No active/ready tab to broadcast extension state to.");
  }
  chrome.runtime.sendMessage({ action: 'extensionStateChanged', newState: currentExtensionState })
    .catch(e => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("BG RCV:", message);
  switch (message.action) {
    case 'getSettings':
      sendResponse({ status: "success", audioSettings: currentAudioSettings, extensionState: currentExtensionState });
      break;
    case 'updateSetting':
      if (message.settingType && message.parameter !== undefined && message.value !== undefined) {
        let newAudioSettings = JSON.parse(JSON.stringify(currentAudioSettings));
        if (!newAudioSettings[message.settingType]) newAudioSettings[message.settingType] = {};
        newAudioSettings[message.settingType][message.parameter] = message.value;
        applyAndStoreAudioSettings(newAudioSettings);
        sendResponse({ status: "success", audioSettings: currentAudioSettings });
      } else { sendResponse({ status: "error", message: "Invalid updateSetting structure" }); }
      break;
    case 'resetToDefaults':
      applyAndStoreAudioSettings(JSON.parse(JSON.stringify(DEFAULT_AUDIO_SETTINGS)));
      sendResponse({ status: "success", audioSettings: currentAudioSettings });
      break;
    case 'setExtensionEnabledState':
      if (message.isEnabled !== undefined) {
        currentExtensionState.isExtensionEnabled = message.isEnabled;
        chrome.storage.local.set({ extensionGlobalState: currentExtensionState }, () => {
          console.log("Extension enabled state saved:", currentExtensionState.isExtensionEnabled);
          broadcastExtensionState(); 
          sendResponse({ status: "success", newState: currentExtensionState });
        });
      } else { sendResponse({ status: "error", message: "isEnabled missing" }); }
      return true;
    case 'audioProcessorReady':
      activeTabId = sender.tab.id;
      audioProcessorPresentInActiveTab = true;
      console.log(`Audio processor ready in tab: ${activeTabId}. Extension enabled: ${currentExtensionState.isExtensionEnabled}`);
      chrome.tabs.sendMessage(activeTabId, { 
          action: 'initializeAudioProcessorState', 
          audioSettings: currentAudioSettings, 
          effectsEnabled: currentExtensionState.isExtensionEnabled 
      }).catch(e => console.warn("Error sending initial state to content script:", e.message));
      sendResponse({ status: "success" });
      break;
    case 'audioProcessorRemoved':
      if (sender.tab.id === activeTabId) { activeTabId = null; audioProcessorPresentInActiveTab = false; }
      sendResponse({ status: "success" });
      break;
    default:
      sendResponse({ status: "error", message: `Unknown action: ${message.action}` });
      break;
  }
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) { activeTabId = null; audioProcessorPresentInActiveTab = false; }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'loading') { audioProcessorPresentInActiveTab = false; }
});

console.log("Background script event listeners set up.");
