// content/content.js
console.log("content.js loaded, AudioProcessor should be available now.");

let currentAudioProcessor = null;
let currentProcessedElement = null;
// This WeakSet tracks elements for which createMediaElementSource has been successfully called ONCE.
// An element cannot have createMediaElementSource called on it multiple times, even with a new AudioContext.
let globallyProcessedElements = new WeakSet(); 
let isContentScriptGloballyEnabled = true; // Renamed from isContentScriptProcessingEnabled
                                       // Reflects the master toggle, not the audio effects bypass state

// Function to initialize or re-initialize audio processing on a given element
async function setupAudioProcessing(element) {
  if (!isContentScriptGloballyEnabled) { // Check master toggle
    console.log("Content script master processing is disabled. Skipping setupAudioProcessing.");
    if (currentAudioProcessor) await disconnectCurrentProcessor();
    return;
  }

  if (!element) {
    console.log("No element provided for audio processing.");
    await disconnectCurrentProcessor();
    return;
  }

  if (currentProcessedElement === element && currentAudioProcessor && currentAudioProcessor.isInitialized) {
    console.log("Already processing this element and processor is initialized:", element);
    return;
  }

  console.log("Attempting to set up audio processing for element:", element);

  if (currentAudioProcessor) {
    console.log("Disconnecting previous AudioProcessor instance before setting up new one.");
    const oldProcessedElement = currentProcessedElement;
    await currentAudioProcessor.disconnect();
    if (oldProcessedElement !== element) {
        chrome.runtime.sendMessage({ action: 'audioProcessorRemoved' })
            .catch(e => console.warn("Error sending audioProcessorRemoved (old replaced):", e.message));
    }
    currentAudioProcessor = null;
  }

  // CRITICAL CHECK: Has this specific DOM element ever been successfully used for createMediaElementSource?
  if (globallyProcessedElements.has(element)) {
    console.warn("This HTMLMediaElement has been processed before. Cannot re-initialize for it.");
    if (currentProcessedElement === element) currentProcessedElement = null;
    if (!currentAudioProcessor) {
        chrome.runtime.sendMessage({ action: 'audioProcessorRemoved' })
            .catch(e => console.warn("Error sending audioProcessorRemoved (cannot reprocess element):", e.message));
    }
    return;
  }

  try {
    const audioProcessor = new AudioProcessor();
    // We will get initial settings and effects enabled state from background via 'initializeAudioProcessorState'
    // So, init is simpler here, AudioProcessor will apply defaults then be updated.
    await audioProcessor.init(element); // Pass only element. Defaults will be used initially.
                                      // setEffectsEnabled will be called via message from background.
    currentAudioProcessor = audioProcessor;
    currentProcessedElement = element;
    globallyProcessedElements.add(element);
    console.log("AudioProcessor initialized for element (waiting for state from background):", element);
    chrome.runtime.sendMessage({ action: 'audioProcessorReady' })
      .catch(e => console.warn("Error sending audioProcessorReady:", e.message));

    element.addEventListener('emptied', handleElementEvent, { once: true });
    element.addEventListener('error', handleElementEvent, { once: true });
    element.addEventListener('abort', handleElementEvent, { once: true });

  } catch (error) {
    console.error("Error initializing AudioProcessor for element:", element, error);
    if (currentAudioProcessor) { // Should be null if the above disconnect block ran for this element
        await currentAudioProcessor.disconnect();
    }
    // If this was the element we were trying to process, ensure it's cleared
    if(currentProcessedElement === element) currentProcessedElement = null;
    currentAudioProcessor = null;
    // Send removal message if we failed to initialize for an element that was supposed to be the new target
    chrome.runtime.sendMessage({ action: 'audioProcessorRemoved' })
        .catch(e => console.warn("Error sending audioProcessorRemoved (init failed):", e.message));
  }
}

async function disconnectCurrentProcessor() {
    if (currentAudioProcessor) {
        console.log("Disconnecting current audio processor explicitly.");
        await currentAudioProcessor.disconnect();
        chrome.runtime.sendMessage({ action: 'audioProcessorRemoved' })
            .catch(e => console.warn("Error sending audioProcessorRemoved (disconnect explicit):", e.message));
        currentAudioProcessor = null;
        currentProcessedElement = null; // Also clear the element being processed
    }
}

function handleElementEvent(event) {
    if (event.target === currentProcessedElement) {
        console.log(`Processed element event: ${event.type}`, event.target);
        disconnectCurrentProcessor(); // Use the new helper
        setTimeout(findAndProcessAudioSources, 100); 
    }
}

// Function to find and select an audio/video element to process
function findAndProcessAudioSources() {
  if (!isContentScriptGloballyEnabled) { // Check master toggle state
    console.log("Content script master processing is disabled. Skipping findAndProcessAudioSources.");
    if (currentAudioProcessor) disconnectCurrentProcessor(); 
    return;
  }
  console.log("findAndProcessAudioSources called");
  const mediaElements = document.querySelectorAll('audio, video');
  let targetElement = null;

  // Simplistic selection: first element that is potentially audible and we haven't failed on recently.
  // A more sophisticated approach might look at `playing`, `volume`, `muted`, or user interaction.
  for (let el of mediaElements) {
    if (el.readyState > 0 && !el.paused) { // Prioritize playing elements
        targetElement = el;
        break;
    }
    if (!targetElement && el.readyState > 0) { // Fallback to any loaded element
        targetElement = el;
    }
  }
  
  if (targetElement) {
    // If the target is the same as current and processor is initialized, do nothing.
    if (targetElement === currentProcessedElement && currentAudioProcessor && currentAudioProcessor.isInitialized) {
        return;
    }
    // Check if element is actually in the document, as QSA can find detached elements
    if (!document.body.contains(targetElement)) {
        console.log("Found target element is detached from DOM, skipping:", targetElement);
        if (targetElement === currentProcessedElement) { // If our current element got detached
             handleElementEvent({target: targetElement, type: 'detached'});
        }
        return;
    }
    setupAudioProcessing(targetElement);
  } else {
    // No suitable element found, disconnect if one was active
    if (currentAudioProcessor) {
      console.log("No suitable audio/video elements found. Disconnecting active processor.");
      setupAudioProcessing(null); // This will trigger disconnect and notify background
    }
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script received message:", message);
  switch (message.action) {
    case 'initializeAudioProcessorState':
      if (currentAudioProcessor && currentAudioProcessor.isInitialized && message.audioSettings) {
        console.log("Initializing AudioProcessor state from background:", message);
        currentAudioProcessor.setEffectsEnabled(message.effectsEnabled, message.audioSettings);
        sendResponse({ status: "success" });
      } else {
        console.warn("Cannot initialize AudioProcessor state: Processor not ready or settings missing.");
        sendResponse({ status: "error" });
      }
      break;
    case 'applyAudioSettings': // Renamed from applySettings
      if (currentAudioProcessor && currentAudioProcessor.isInitialized && message.settings && isContentScriptGloballyEnabled) {
        console.log("Applying audio settings from background:", message.settings);
        // The AudioProcessor's updateAllNodeSettings will respect its internal isEffectsEnabled flag
        currentAudioProcessor.updateAllNodeSettings(message.settings.compressor, message.settings.limiter, message.settings.amplifier);
        sendResponse({ status: "success" });
      } else {
        console.warn("Cannot apply audio settings: No active/initialized processor, settings missing, or master processing disabled.");
        sendResponse({ status: "error" });
      }
      break;
    case 'setAudioEffectsEnabled': // Renamed from enableProcessing/disableProcessing
      if (currentAudioProcessor && currentAudioProcessor.isInitialized) {
        console.log(`Content script: setAudioEffectsEnabled received, enable: ${message.enable}`);
        // We need the current audio settings to re-apply if enabling effects
        // AudioProcessor now stores lastAppliedAudioSettings, so it can handle this.
        currentAudioProcessor.setEffectsEnabled(message.enable, currentAudioProcessor.lastAppliedAudioSettings);
        sendResponse({ status: "success" });
      } else {
        console.warn("Cannot setAudioEffectsEnabled: AudioProcessor not ready.");
        sendResponse({ status: "error" });
      }
      // Update the global enabled state for the content script regardless of processor readiness for future checks.
      // This is important if the page had no audio element when toggle happened.
      isContentScriptGloballyEnabled = message.enable; 
      break;
    default:
      sendResponse({ status: "error", message: "Unknown action for content script." });
      break;
  }
  return true;
});

// Initial scan for audio sources when the script loads
findAndProcessAudioSources();

// Observe DOM changes for dynamically added/removed audio/video elements
const observer = new MutationObserver((mutationsList) => {
  if (!isContentScriptGloballyEnabled) return; // Don't observe if disabled
  let potentiallyRelevantChange = false;
  for (const mutation of mutationsList) {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO' || (node.querySelector && (node.querySelector('audio') || node.querySelector('video')))) {
          console.log("Relevant node added:", node);
          potentiallyRelevantChange = true;
        }
      });
      mutation.removedNodes.forEach(node => {
        if (node === currentProcessedElement || node.tagName === 'AUDIO' || node.tagName === 'VIDEO' || (node.querySelector && (node.querySelector('audio') || node.querySelector('video')))){
            if (node === currentProcessedElement) handleElementEvent({target: node, type: 'dom_removed'});
            potentiallyRelevantChange = true; 
        }
      });
    }
    // Also consider attribute changes like 'src', 'autoplay', 'controls' if they affect playability
    if (mutation.type === 'attributes' && (mutation.target.tagName === 'AUDIO' || mutation.target.tagName === 'VIDEO')) {
        if (mutation.attributeName === 'src' || mutation.attributeName === 'autoplay' || mutation.attributeName === 'controls' || mutation.attributeName === 'paused') {
            console.log("Relevant attribute changed on media element:", mutation.target, mutation.attributeName);
            potentiallyRelevantChange = true;
        }
    }
  }
  if (potentiallyRelevantChange) {
    console.log("DOM mutation detected (processing enabled), re-evaluating audio sources.");
    findAndProcessAudioSources();
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

// Also, listen for play events on any media element as a trigger to re-evaluate processing.
// This helps if an element existed but wasn't playing, then starts.
document.addEventListener('play', (event) => {
    if (!isContentScriptGloballyEnabled) return; // Don't react to play if disabled
    if (event.target.tagName === 'AUDIO' || event.target.tagName === 'VIDEO') {
        console.log("'play' event detected (processing enabled):", event.target);
        // If this isn't our current element, or if we have no current element, try to process it.
        if (event.target !== currentProcessedElement || !currentAudioProcessor || !currentAudioProcessor.isInitialized) {
            findAndProcessAudioSources(); 
        }
    }
}, true); // Use capture phase to catch events early

console.log("Content script initialized with audio detection and message listener.");
