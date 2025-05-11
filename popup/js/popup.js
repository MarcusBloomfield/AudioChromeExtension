console.log("popup.js loaded");

// Helper function to convert ms to seconds
function msToSeconds(ms) {
  return parseFloat(ms) / 1000;
}

// Helper function to convert seconds to ms
function secondsToMs(s) {
  return parseFloat(s) * 1000;
}

// Global controls configuration (accessible by updateUiControls)
const controlsConfig = [
  // Compressor
  { id: 'comp-threshold', valueId: 'comp-threshold-value', settingType: 'compressor', parameter: 'threshold', unit: ' dB', preprocess: parseFloat },
  { id: 'comp-ratio', valueId: 'comp-ratio-value', settingType: 'compressor', parameter: 'ratio', unit: ':1', preprocess: parseFloat },
  { id: 'comp-attack', valueId: 'comp-attack-value', settingType: 'compressor', parameter: 'attack', unit: ' ms', preprocess: msToSeconds, postprocess: secondsToMs },
  { id: 'comp-release', valueId: 'comp-release-value', settingType: 'compressor', parameter: 'release', unit: ' ms', preprocess: msToSeconds, postprocess: secondsToMs },
  { id: 'comp-knee', valueId: 'comp-knee-value', settingType: 'compressor', parameter: 'knee', unit: ' dB', preprocess: parseFloat },
  // Limiter
  { id: 'limiter-threshold', valueId: 'limiter-threshold-value', settingType: 'limiter', parameter: 'threshold', unit: ' dB', preprocess: parseFloat },
  // Amplifier
  { id: 'amp-gain', valueId: 'amp-gain-value', settingType: 'amplifier', parameter: 'gain', unit: ' dB', preprocess: parseFloat }
];

const audioControlSections = ['meter-section', 'compressor-section', 'limiter-section', 'amplifier-section'];

// Helper function to update the decibel meter
function updateDecibelMeter(dbLevel) {
  const dbMeterFill = document.getElementById('db-meter-fill');
  const dbValueDisplay = document.getElementById('db-value-display');
  
  if (!dbMeterFill || !dbValueDisplay) return;
  
  // Convert dB level to a percentage for the meter
  // Map from minDb to maxDb to 0-100%
  const minDb = -80; // Match the analyserNode.minDecibels
  const maxDb = 0;   // Match the analyserNode.maxDecibels
  let percent = 100 - (((dbLevel - maxDb) / (minDb - maxDb)) * 100);
  
  // Clamp between 0 and 100
  percent = Math.max(0, Math.min(100, percent));
  
  // Update the meter fill
  dbMeterFill.style.width = (100 - percent) + '%';
  
  // Update the text display
  if (dbLevel <= minDb) {
    dbValueDisplay.textContent = '-∞ dB';
  } else {
    dbValueDisplay.textContent = dbLevel.toFixed(1) + ' dB';
  }
}

function updateUiControls(audioSettings) {
  console.log("Updating UI audio controls with settings:", audioSettings);
  controlsConfig.forEach(controlConf => {
    const controlElement = document.getElementById(controlConf.id);
    const valueElement = document.getElementById(controlConf.valueId);
    if (controlElement && valueElement && audioSettings[controlConf.settingType] && audioSettings[controlConf.settingType][controlConf.parameter] !== undefined) {
      let valueToSet = audioSettings[controlConf.settingType][controlConf.parameter];
      if (controlConf.postprocess) valueToSet = controlConf.postprocess(valueToSet);
      controlElement.value = valueToSet;
      valueElement.textContent = controlElement.value;
    }
  });
}

function setUiEnabledState(isEnabled) {
    console.log("Setting UI enabled state to:", isEnabled);
    audioControlSections.forEach(sectionId => {
        const section = document.getElementById(sectionId);
        if (section) {
            if (isEnabled) {
                section.classList.remove('disabled');
            } else {
                section.classList.add('disabled');
            }
        }
    });
    // Also disable/enable the reset button container if needed
    const globalActionsSection = document.querySelector('.global-actions');
    if (globalActionsSection) {
        if (isEnabled) {
            globalActionsSection.classList.remove('disabled');
        } else {
            globalActionsSection.classList.add('disabled');
        }
    }
}

document.addEventListener('DOMContentLoaded', function () {
  console.log("DOM fully loaded and parsed");
  const masterEnableToggle = document.getElementById('master-enable-toggle');

  // Setup listeners for audio controls
  controlsConfig.forEach(controlConfig => {
    const controlElement = document.getElementById(controlConfig.id);
    const valueElement = document.getElementById(controlConfig.valueId);
    if (controlElement && valueElement) {
      valueElement.textContent = controlElement.value;
      controlElement.addEventListener('input', () => {
        if (!masterEnableToggle.checked) return; // Don't send if master toggle is off (though UI should be disabled)
        const rawValue = controlElement.value;
        valueElement.textContent = rawValue;
        let processedValue = controlConfig.preprocess ? controlConfig.preprocess(rawValue) : parseFloat(rawValue);
        chrome.runtime.sendMessage({
          action: 'updateSetting', settingType: controlConfig.settingType,
          parameter: controlConfig.parameter, value: processedValue
        });
      });
    }
  });

  // Master Enable Toggle listener
  if (masterEnableToggle) {
    masterEnableToggle.addEventListener('change', function() {
      const isEnabled = this.checked;
      console.log("Master enable toggle changed to:", isEnabled);
      chrome.runtime.sendMessage({ action: 'setExtensionEnabledState', isEnabled: isEnabled }, response => {
        if (response && response.status === 'success') {
          setUiEnabledState(isEnabled);
        } else {
          console.error("Failed to set extension enabled state.");
          // Revert UI toggle if backend call failed?
          this.checked = !isEnabled;
        }
      });
    });
  }

  // Reset to Defaults button
  const resetButton = document.getElementById('reset-defaults');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      if (!masterEnableToggle.checked) return; // Don't allow reset if extension is disabled
      console.log("Reset to Defaults button clicked.");
      chrome.runtime.sendMessage({ action: 'resetToDefaults' }, response => {
        if (response && response.status === 'success' && response.audioSettings) {
          updateUiControls(response.audioSettings);
        } else { console.error("Failed to reset audio settings."); }
      });
    });
  }

  // Request initial settings from background script
  chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
    if (response && response.status === 'success') {
      console.log("Initial data from background:", response);
      if (response.audioSettings) updateUiControls(response.audioSettings);
      if (response.extensionState && masterEnableToggle) {
        masterEnableToggle.checked = response.extensionState.isExtensionEnabled;
        setUiEnabledState(response.extensionState.isExtensionEnabled);
      }
    } else { console.error("Failed to fetch initial settings."); }
  });

  // Listen for external state changes (e.g. if another popup instance changes it, though less common)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extensionStateChanged' && masterEnableToggle) {
        console.log("Popup received extensionStateChanged:", message.newState);
        masterEnableToggle.checked = message.newState.isExtensionEnabled;
        setUiEnabledState(message.newState.isExtensionEnabled);
    } else if (message.action === 'decibelUpdate') {
        updateDecibelMeter(message.value);
    }
  });

  // Initialize decibel meter at lowest value
  updateDecibelMeter(-100);

  console.log("Popup UI initialized.");
}); 