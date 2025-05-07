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

function updateUiControls(settings) {
  console.log("Updating UI controls with settings:", settings);
  controlsConfig.forEach(controlConf => {
    const controlElement = document.getElementById(controlConf.id);
    const valueElement = document.getElementById(controlConf.valueId);

    if (controlElement && valueElement && settings[controlConf.settingType] && settings[controlConf.settingType][controlConf.parameter] !== undefined) {
      let valueToSet = settings[controlConf.settingType][controlConf.parameter];
      
      if (controlConf.postprocess) {
        valueToSet = controlConf.postprocess(valueToSet);
      }
      
      controlElement.value = valueToSet;
      valueElement.textContent = controlElement.value;
    } else {
      console.warn(`Could not update UI for ${controlConf.settingType}.${controlConf.parameter}. Control or setting not found.`);
    }
  });
}

document.addEventListener('DOMContentLoaded', function () {
  console.log("DOM fully loaded and parsed");

  // Slider/Control input listeners
  controlsConfig.forEach(controlConfig => {
    const controlElement = document.getElementById(controlConfig.id);
    const valueElement = document.getElementById(controlConfig.valueId);

    if (controlElement && valueElement) {
      // Initialize display from control's current value (will be updated by fetched settings)
      valueElement.textContent = controlElement.value;

      controlElement.addEventListener('input', () => {
        const rawValue = controlElement.value;
        valueElement.textContent = rawValue;

        let processedValue = controlConfig.preprocess ? controlConfig.preprocess(rawValue) : parseFloat(rawValue);
        
        chrome.runtime.sendMessage({
          action: 'updateSetting',
          settingType: controlConfig.settingType,
          parameter: controlConfig.parameter,
          value: processedValue
        }, response => {
          if (chrome.runtime.lastError) {
            console.error("Error sending updateSetting message:", chrome.runtime.lastError.message);
          } else if (response && response.status === 'success') {
            // console.log("Setting update acknowledged by background script.");
          } else {
            console.warn("Background script response issues for updateSetting:", response);
          }
        });
      });
    } else {
      console.warn(`Control or value element not found for ${controlConfig.id}`);
    }
  });

  // Reset to Defaults button
  const resetButton = document.getElementById('reset-defaults');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      console.log("Reset to Defaults button clicked. Proceeding without confirmation.");
      chrome.runtime.sendMessage({ action: 'resetToDefaults' }, response => {
        if (chrome.runtime.lastError) {
          console.error("Error sending resetToDefaults message:", chrome.runtime.lastError.message);
          alert("Error: Could not reset settings. Please try again.");
        } else if (response && response.status === 'success' && response.settings) {
          console.log("Received new default settings from background:", response.settings);
          updateUiControls(response.settings);
          console.log("Settings have been reset to defaults.");
        } else {
          console.error("Failed to reset settings or receive new settings:", response);
          alert("Failed to reset settings. Please try again.");
        }
      });
    });
  } else {
    console.warn("Reset to Defaults button not found.");
  }

  // Request initial settings from background script when popup opens
  chrome.runtime.sendMessage({ action: 'getSettings' }, response => {
    if (chrome.runtime.lastError) {
      console.error("Error fetching initial settings:", chrome.runtime.lastError.message);
    } else if (response && response.status === 'success' && response.settings) {
      console.log("Received initial settings from background:", response.settings);
      updateUiControls(response.settings);
    } else {
      console.error("Failed to fetch initial settings:", response);
    }
  });

  console.log("Popup UI initialized with event listeners and initial settings request.");
}); 