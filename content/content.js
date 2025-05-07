// content/content.js
console.log("content.js loaded, AudioProcessor should be available now.");

let currentAudioProcessor = null;
let currentProcessedElement = null;
let processingAttemptedFor = new WeakSet(); // Keep track of elements we've tried to process

// Function to initialize or re-initialize audio processing on a given element
async function setupAudioProcessing(element) {
  if (!element) {
    console.log("No element provided for audio processing.");
    if (currentAudioProcessor) {
      console.log("Disconnecting existing audio processor as no new element is targeted.");
      await currentAudioProcessor.disconnect();
      chrome.runtime.sendMessage({ action: 'audioProcessorRemoved' })
        .catch(e => console.warn("Error sending audioProcessorRemoved:", e.message));
      currentAudioProcessor = null;
      currentProcessedElement = null;
    }
    return;
  }

  // If we are already processing this exact element, do nothing.
  if (currentProcessedElement === element && currentAudioProcessor && currentAudioProcessor.isInitialized) {
    console.log("Already processing this element:", element);
    return;
  }

  console.log("Attempting to set up audio processing for element:", element);

  // Disconnect any existing processor if it's on a different element or not initialized
  if (currentAudioProcessor) {
    console.log("Disconnecting previous AudioProcessor instance.");
    await currentAudioProcessor.disconnect();
    // No need to send audioProcessorRemoved yet, as we might successfully init a new one.
    // If the new init fails, or if no element is found later, then it will be sent.
    currentAudioProcessor = null;
    currentProcessedElement = null;
  }

  try {
    // Create and initialize the AudioProcessor
    // AudioContext might require a user gesture. `init` handles creation/resuming.
    // The media element itself playing often serves as this gesture.
    const audioProcessor = new AudioProcessor();
    await audioProcessor.init(element);
    
    currentAudioProcessor = audioProcessor;
    currentProcessedElement = element;
    processingAttemptedFor.add(element);
    console.log("AudioProcessor initialized successfully for:", element);
    chrome.runtime.sendMessage({ action: 'audioProcessorReady' })
      .then(response => console.log("Background response to audioProcessorReady:", response))
      .catch(e => console.warn("Error sending audioProcessorReady:", e.message));

    // Add event listeners to clean up if the element is paused for too long or ends
    element.addEventListener('emptied', handleElementRemoved, { once: true });
    element.addEventListener('error', handleElementRemoved, { once: true });

  } catch (error) {
    console.error("Error initializing AudioProcessor for element:", element, error);
    // If init failed, ensure we clean up and notify background if we were previously processing.
    if (currentAudioProcessor) { // This shouldn't happen if logic is correct, but as a safeguard
        await currentAudioProcessor.disconnect();
    }
    currentAudioProcessor = null;
    currentProcessedElement = null;
    // If there was no *new* successful processor, and an *old* one was active, we should signal removal.
    // This case is complex; safer to rely on mutation observer for explicit removals.
  }
}

function handleElementRemoved(event) {
    if (event.target === currentProcessedElement) {
        console.log("Processed element event indicating removal/error:", event.type, event.target);
        if (currentAudioProcessor) {
            currentAudioProcessor.disconnect().then(() => {
                chrome.runtime.sendMessage({ action: 'audioProcessorRemoved' })
                    .catch(e => console.warn("Error sending audioProcessorRemoved:", e.message));
                currentAudioProcessor = null;
                currentProcessedElement = null;
            });
        }
    }
}

// Function to find and select an audio/video element to process
function findAndProcessAudioSources() {
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
             handleElementRemoved({target: targetElement, type: 'detached'});
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
  if (message.action === 'applySettings') {
    if (currentAudioProcessor && currentAudioProcessor.isInitialized && message.settings) {
      console.log("Applying settings from background:", message.settings);
      currentAudioProcessor.updateCompressorSettings(message.settings.compressor);
      currentAudioProcessor.updateLimiterSettings(message.settings.limiter);
      currentAudioProcessor.updateAmplifierSettings(message.settings.amplifier);
      sendResponse({ status: "success", message: "Settings applied by content script." });
    } else {
      console.warn("Cannot apply settings: No active audio processor or settings missing.");
      sendResponse({ status: "error", message: "No active audio processor or settings missing." });
    }
  } else {
    sendResponse({ status: "error", message: "Unknown action for content script." });
  }
  return true; // For async sendResponse
});

// Initial scan for audio sources when the script loads
findAndProcessAudioSources();

// Observe DOM changes for dynamically added/removed audio/video elements
const observer = new MutationObserver((mutationsList) => {
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
        if (node === currentProcessedElement) {
          console.log("Currently processed element removed from DOM:", node);
          handleElementRemoved({target: node, type: 'dom_removed'});
          potentiallyRelevantChange = true; // Re-scan in case other elements are now primary
        } else if (node.tagName === 'AUDIO' || node.tagName === 'VIDEO' || (node.querySelector && (node.querySelector('audio') || node.querySelector('video')))){
          potentiallyRelevantChange = true; // Other audio/video removed, might affect primary choice
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
    console.log("DOM mutation detected, re-evaluating audio sources.");
    findAndProcessAudioSources();
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

// Also, listen for play events on any media element as a trigger to re-evaluate processing.
// This helps if an element existed but wasn't playing, then starts.
document.addEventListener('play', (event) => {
    if (event.target.tagName === 'AUDIO' || event.target.tagName === 'VIDEO') {
        console.log("'play' event detected on media element:", event.target);
        // If this isn't our current element, or if we have no current element, try to process it.
        if (event.target !== currentProcessedElement || !currentAudioProcessor || !currentAudioProcessor.isInitialized) {
            findAndProcessAudioSources(); 
        }
    }
}, true); // Use capture phase to catch events early

console.log("Content script initialized with audio detection and message listener.");
