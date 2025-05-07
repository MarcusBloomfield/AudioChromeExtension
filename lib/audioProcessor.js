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

  async init(htmlMediaElement) {
    if (this.isInitialized) {
      console.warn("AudioProcessor already initialized. Call disconnect() first if re-initializing.");
      await this.disconnect(); // Disconnect previous source if any
    }

    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log("AudioContext created.");
    } else if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log("AudioContext resumed.");
    }
    
    try {
      this.sourceNode = this.audioContext.createMediaElementSource(htmlMediaElement);
      console.log("MediaElementSource created.");
    } catch (error) {
      console.error("Error creating MediaElementSource:", error);
      console.error("Ensure the media element has loaded its metadata and has a CORS-compatible source if it's cross-origin.");
      // Attempt to re-create AudioContext if it's in a bad state from a previous element
      if (this.audioContext && this.audioContext.state !== 'running') {
        console.log("Attempting to recreate AudioContext due to potential previous error.");
        this.audioContext.close();
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sourceNode = this.audioContext.createMediaElementSource(htmlMediaElement);
        console.log("AudioContext recreated and MediaElementSource created.");
      } else {
         throw error; // Re-throw if still failing
      }
    }


    // Create Compressor Node
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.updateCompressorSettings(this.defaultCompressorSettings); // Apply defaults
    console.log("CompressorNode created and configured with defaults.");

    // Create Limiter Node (another DynamicsCompressor with limiter-specific settings)
    this.limiterNode = this.audioContext.createDynamicsCompressor();
    this.updateLimiterSettings(this.defaultLimiterSettings); // Apply defaults
    console.log("LimiterNode created and configured with defaults.");
    
    // Create Gain Node (Amplifier)
    this.gainNode = this.audioContext.createGain();
    this.updateAmplifierSettings(this.defaultAmplifierSettings); // Apply defaults
    console.log("GainNode created and configured with defaults.");

    // Create Analyser Node
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048; // Common value for FFT size
    console.log("AnalyserNode created.");

    // Connect the audio graph: Source -> Compressor -> Limiter -> Gain -> Analyser -> Destination
    this.sourceNode.connect(this.compressorNode);
    this.compressorNode.connect(this.limiterNode);
    this.limiterNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);
    console.log("Audio graph connected.");

    this.isInitialized = true;
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

  async disconnect() {
    if (!this.isInitialized || !this.audioContext) return;

    console.log("Disconnecting AudioProcessor...");
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
      console.log("SourceNode disconnected.");
    }
    // Disconnect other nodes in reverse order to be safe, though source.disconnect() should handle downstream
    if (this.analyserNode) this.analyserNode.disconnect();
    if (this.gainNode) this.gainNode.disconnect();
    if (this.limiterNode) this.limiterNode.disconnect();
    if (this.compressorNode) this.compressorNode.disconnect();
    
    // It's often better to keep the AudioContext alive if the extension might process another element soon.
    // Closing it means it needs to be recreated.
    // However, if no audio is expected for a while, closing can save resources.
    // For now, let's keep it open but reset state.
    // await this.audioContext.close(); // Uncomment if you want to close context on disconnect
    // this.audioContext = null;

    this.isInitialized = false;
    console.log("AudioProcessor disconnected. AudioContext remains open but graph is dismantled.");
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