# Audio Manager Chrome Extension

This Chrome extension provides tools for managing browser audio, including a Compressor, Limiter, and Amplifier.
It uses the Web Audio API to process audio from any audio/video element on a webpage in real-time.

## Features

- **Compressor**: Adjust threshold, ratio, attack, release, and knee.
- **Limiter**: Configurable threshold for peak limiting (fast attack/release).
- **Amplifier**: Adjustable gain from -20dB to +20dB.
- **Real-time Control**: Settings are applied instantly.
- **Preset Management**: Save and load custom audio settings (planned).
- **Audio Visualization**: Waveform and level meter display (planned).
- **Dynamic Element Detection**: Automatically detects and processes audio/video elements, including those added dynamically to the page.

## Project Structure

- `manifest.json`: Defines the extension's configuration, permissions, and scripts.
- `popup/`:
  - `popup.html`: The main user interface for controlling audio settings.
  - `popup.css`: Styles for the popup interface.
  - `popup.js`: Handles UI logic, communication with the background script, and user interactions.
- `background/`:
  - `background.js`: The service worker that manages the audio processing state, handles settings storage, and communicates between the popup and content scripts.
- `content/`:
  - `content.js`: Injected into web pages to detect audio/video elements and enable audio processing via the `AudioProcessor`.
- `lib/`:
  - `audioProcessor.js`: Contains the core `AudioProcessor` class that uses the Web Audio API to create and manage the audio processing chain (Compressor, Limiter, Gain, Analyser).
- `icons/`: Contains the extension's icons.

## How to Use (Development)

1. Clone this repository (or download the source).
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable "Developer mode" (usually a toggle in the top right).
4. Click "Load unpacked".
5. Select the directory containing this project's files.

The extension icon should appear in your Chrome toolbar. Click it on a page with audio/video to manage its audio settings.

## Technical Details

- **Web Audio API**: Core technology for audio manipulation.
- **Chrome Extension APIs**: For popup, background service worker, content scripts, and storage.
- **Audio Processing Chain**: MediaElementSource -> DynamicsCompressorNode (Compressor) -> DynamicsCompressorNode (Limiter) -> GainNode (Amplifier) -> AnalyserNode -> Destination.

## Contribution

Contributions, issues, and feature requests are welcome. Please refer to the project's issue tracker. 