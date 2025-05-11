// lib/audioProcessor.js
// This file will contain the core audio processing logic using the Web Audio API.

console.log("audioProcessor.js loaded");

console.log("AudioProcessor class loading");

class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.compressorNode = null;
    this.limiterNode = null;
    this.gainNode = null;
    this.analyserNode = null;
    this.isInitialized = false;
    this.isEffectsEnabled = true; // New: Tracks if effects should be active or bypassed
    this.lastAppliedAudioSettings = null; // New: To store settings when enabling effects

    // Default settings (can be overridden by UI values)
    this.defaultCompressorSettings = {
      threshold: -24, // dB
      ratio: 12,      // ratio:1
      attack: 0.02,   // seconds
      release: 0.25,  // seconds
      knee: 30        // dB
    };
    this.defaultLimiterSettings = {
      threshold: -3,  // dB
      attack: 0.001,  // ~1ms, very fast for limiting
      release: 0.05, // ~50ms, relatively fast
      ratio: 20,      // High ratio for limiting
      knee: 0          // Hard knee for limiting
    };
    this.defaultAmplifierSettings = {
      gain: 0 // dB
    };

    console.log("AudioProcessor instance created.");
  }

  async init(htmlMediaElement, initialAudioSettings, initialEffectsEnabledState = true) {
    if (this.isInitialized) {
      console.warn("AudioProcessor already initialized. Call disconnect() first if re-initializing.");
      await this.disconnect();
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
        console.warn("AudioContext was not properly closed or still exists. Attempting to close.");
        await this.audioContext.close().catch(e => console.warn("Error closing pre-existing AudioContext:", e));
        this.audioContext = null;
    }
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log("New AudioContext created/resumed for init.");
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    try {
      this.sourceNode = this.audioContext.createMediaElementSource(htmlMediaElement);
    } catch (error) {
      console.error("Error creating MediaElementSource:", error);
      if (this.audioContext) await this.audioContext.close().catch(e => {}); // Clean up context if source fails
      this.audioContext = null;
      throw error;
    }

    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.limiterNode = this.audioContext.createDynamicsCompressor();
    this.gainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    
    // Configure analyser for decibel readings
    this.analyserNode.minDecibels = -80;  // Lower limit for decibel range
    this.analyserNode.maxDecibels = 0;    // Upper limit for decibel range - 0 dB is max
    this.analyserNode.smoothingTimeConstant = 0.4; // Smoother transitions (0-1)

    this.sourceNode.connect(this.compressorNode);
    this.compressorNode.connect(this.limiterNode);
    this.limiterNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);
    console.log("Audio graph connected during init.");

    this.isInitialized = true;
    this.lastAppliedAudioSettings = JSON.parse(JSON.stringify(initialAudioSettings || {
        compressor: this.defaultCompressorSettings,
        limiter: this.defaultLimiterSettings,
        amplifier: this.defaultAmplifierSettings
    }));
    this.setEffectsEnabled(initialEffectsEnabledState, this.lastAppliedAudioSettings); // Apply initial state

    htmlMediaElement.addEventListener('ended', this.handleMediaEnded.bind(this), { once: true });
    htmlMediaElement.addEventListener('pause', this.handleMediaPause.bind(this));
    htmlMediaElement.addEventListener('play', this.handleMediaPlay.bind(this));

    console.log("AudioProcessor initialized successfully.");
  }

  handleMediaEnded() {
    console.log("Media element playback ended. Consider disconnecting or handling state.");
    // Optionally, you could automatically disconnect or go into a suspended state
  }
  
  handleMediaPause() {
    if (this.audioContext && this.audioContext.state === 'running') {
      // this.audioContext.suspend(); // Suspending context on pause can be aggressive
      console.log("Media paused. AudioContext remains active.");
    }
  }

  handleMediaPlay() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
      console.log("Media playing, AudioContext resumed.");
    }
  }

  setEffectsEnabled(enable, audioSettingsToApply) {
    if (!this.isInitialized) {
        console.warn("AudioProcessor not initialized, cannot set effects enabled state.");
        return;
    }
    this.isEffectsEnabled = enable;
    if (enable) {
        console.log("Enabling audio effects with settings:", audioSettingsToApply);
        if (audioSettingsToApply) {
            this.lastAppliedAudioSettings = JSON.parse(JSON.stringify(audioSettingsToApply)); // Store for re-enabling
            this.updateAllNodeSettings(audioSettingsToApply.compressor, audioSettingsToApply.limiter, audioSettingsToApply.amplifier);
        } else if (this.lastAppliedAudioSettings) {
            console.log("Enabling audio effects with last applied settings.");
            this.updateAllNodeSettings(this.lastAppliedAudioSettings.compressor, this.lastAppliedAudioSettings.limiter, this.lastAppliedAudioSettings.amplifier);
        } else {
            console.warn("Cannot enable effects: no settings provided and no last applied settings available.");
        }
    } else {
        console.log("Disabling (bypassing) audio effects by setting neutral parameters.");
        this.updateCompressorSettings({ threshold: 0, ratio: 1, attack: 0, release: 0, knee: 0 });
        this.updateLimiterSettings({ threshold: 0, ratio: 1, attack: 0, release: 0, knee: 0 }); // Effectively off
        this.updateAmplifierSettings({ gain: 0 }); // 0dB gain = no change
    }
  }
  
  // Combined update function called by setEffectsEnabled or directly for settings changes
  updateAllNodeSettings(compSettings, limSettings, ampSettings) {
    if (!this.isInitialized) return;
    if (this.isEffectsEnabled) { // Only apply if effects are generally enabled
        if (compSettings) this.updateCompressorSettings(compSettings);
        if (limSettings) this.updateLimiterSettings(limSettings);
        if (ampSettings) this.updateAmplifierSettings(ampSettings);
        // Store these as the last successfully applied settings if effects are on
        if(compSettings && limSettings && ampSettings) {
            this.lastAppliedAudioSettings = { compressor: compSettings, limiter: limSettings, amplifier: ampSettings };
        }
    } else {
        console.log("Effects are currently disabled (bypassed), not applying new settings to nodes directly. Storing for later.");
        // Store settings even if bypassed, so when re-enabled, latest desired settings are used.
        if(compSettings && limSettings && ampSettings) {
            this.lastAppliedAudioSettings = { compressor: compSettings, limiter: limSettings, amplifier: ampSettings };
        }
    }
  }

  updateCompressorSettings(settings) {
    if (!this.compressorNode || !this.audioContext) return;
    const { threshold, ratio, attack, release, knee } = settings;
    // Web Audio API uses seconds for attack/release, UI might use ms. Assuming seconds from defaults.
    if (threshold !== undefined) this.compressorNode.threshold.setValueAtTime(threshold, this.audioContext.currentTime);
    if (ratio !== undefined) this.compressorNode.ratio.setValueAtTime(ratio, this.audioContext.currentTime);
    if (attack !== undefined) this.compressorNode.attack.setValueAtTime(attack, this.audioContext.currentTime);
    if (release !== undefined) this.compressorNode.release.setValueAtTime(release, this.audioContext.currentTime);
    if (knee !== undefined) this.compressorNode.knee.setValueAtTime(knee, this.audioContext.currentTime);
    console.log("Compressor settings updated:", settings);
  }

  updateLimiterSettings(settings) {
    if (!this.limiterNode || !this.audioContext) return;
    // Limiter is a DynamicsCompressorNode with specific settings
    const { threshold, attack, release, ratio, knee } = settings;
    if (threshold !== undefined) this.limiterNode.threshold.setValueAtTime(threshold, this.audioContext.currentTime);
    if (attack !== undefined) this.limiterNode.attack.setValueAtTime(attack, this.audioContext.currentTime);
    if (release !== undefined) this.limiterNode.release.setValueAtTime(release, this.audioContext.currentTime);
    if (ratio !== undefined) this.limiterNode.ratio.setValueAtTime(ratio, this.audioContext.currentTime); // Typically high for a limiter (e.g., 20)
    if (knee !== undefined) this.limiterNode.knee.setValueAtTime(knee, this.audioContext.currentTime); // Typically 0 for a hard knee limiter
    console.log("Limiter settings updated:", settings);
  }

  updateAmplifierSettings(settings) {
    if (!this.gainNode || !this.audioContext) return;
    const { gain } = settings; // gain in dB
    if (gain !== undefined) {
      // Convert dB to linear gain value
      const linearGain = Math.pow(10, gain / 20);
      this.gainNode.gain.setValueAtTime(linearGain, this.audioContext.currentTime);
      console.log(`Amplifier gain updated: ${gain} dB (Linear: ${linearGain})`);
    }
  }

  getAnalyserData() {
    if (!this.analyserNode) return null;
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteTimeDomainData(dataArray); // For waveform
    // Or getByteFrequencyData(dataArray) for frequency spectrum
    return dataArray;
  }
  
  getFrequencyData() {
    if (!this.analyserNode) return null;
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  getDecibelLevel() {
    if (!this.analyserNode || !this.audioContext) return -100; // Return very low value if no analyser
    
    // Get frequency data from analyser - this already returns values in dBFS
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    this.analyserNode.getFloatFrequencyData(dataArray);
    
    // Find the maximum value across frequency bins
    let maxDb = -Infinity;
    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] > maxDb) {
        maxDb = dataArray[i];
      }
    }
    
    // getFloatFrequencyData returns values in range [minDecibels, maxDecibels]
    // Default range is [-100, -30] but we want to ensure we return a reasonable value
    return maxDb === -Infinity ? -100 : maxDb;
  }

  async disconnect() {
    if (!this.isInitialized && !this.audioContext) return; // Modified guard
    console.log("Disconnecting AudioProcessor...");
    if (this.sourceNode) { this.sourceNode.disconnect(); this.sourceNode = null; }
    if (this.analyserNode) this.analyserNode.disconnect();
    if (this.gainNode) this.gainNode.disconnect();
    if (this.limiterNode) this.limiterNode.disconnect();
    if (this.compressorNode) this.compressorNode.disconnect();
    
    if (this.audioContext) {
        try { await this.audioContext.close(); console.log("AudioContext closed."); }
        catch (e) { console.warn("Error closing AudioContext:", e.message); }
        this.audioContext = null;
    }
    this.isInitialized = false;
    this.isEffectsEnabled = true; // Reset to default for next potential init
    this.lastAppliedAudioSettings = null;
    console.log("AudioProcessor fully disconnected.");
  }

  // Utility to convert ms to seconds for attack/release times if UI sends ms
  static msToSeconds(ms) {
    return ms / 1000;
  }
}

// Export the class if this file is treated as a module (e.g., by background.js)
// If it's directly injected or used as a classic script, it will be available globally.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioProcessor;
} else if (typeof export_AudioProcessor === 'function') { // A way to allow exporting in non-module environments if needed
  export_AudioProcessor(AudioProcessor);
}

console.log("AudioProcessor class defined."); 