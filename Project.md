# Audio Chrome Extension Project

## Project Overview
- Chrome extension for managing browser audio
- Features: Compressor, Limiter, and Amplifier
- Uses Web Audio API for audio processing
- Processes audio from any audio/video element on the page

## Technical Stack
- HTML/CSS/JavaScript
- Web Audio API
- Chrome Extension APIs

## Project Structure
- `manifest.json`: Extension configuration
- `popup/`:
  - `popup.html`: Main UI with sliders and controls. Currently a single-page layout.
  - `popup.css`: Modern, responsive styling.
  - `js/popup.js`: UI logic, communication with background script.
- `background/`:
  - `background.js`: Service worker for audio processing state, settings storage, and inter-script communication.
- `content/`:
  - `content.js`: Page interaction, audio element detection, and `AudioProcessor` management.
- `lib/`:
  - `audioProcessor.js`: Core Web Audio API processing logic (Compressor, Limiter, Gain, Analyser).
- `icons/`: Extension icons.
- `README.md`: Project overview, setup, and technical details.
- `LICENSE`: MIT License file.
- `privacy.md`: Privacy policy document.
- `.gitignore`: Specifies intentionally untracked files that Git should ignore.

## Features Implemented
- **Audio Compression**: Adjustable threshold, ratio, attack, release, and knee.
- **Audio Limiting**: Adjustable threshold with fixed fast attack/release.
- **Audio Amplification**: Adjustable gain.
- **Real-time Control**: Settings are applied instantly via communication between popup, background, and content scripts.
- **Core Settings Storage**: Current parameters for Compressor, Limiter, and Amplifier are saved to `chrome.storage.local` and loaded on popup open.
- **Reset to Defaults**: Button to revert all core audio settings to their initial default values (acts immediately without confirmation).
- **Dynamic Element Detection**: `content.js` detects audio/video elements, including those added dynamically, and attempts to manage a single `AudioProcessor` instance.
- **Basic Project Documentation**: `README.md`, `LICENSE` (MIT), and `privacy.md` created.
- **Master Enable/Disable Toggle**: A global toggle in the popup UI allows enabling/disabling all audio processing. State is persisted and respected by content scripts.
- **Real-time Decibel Meter**: Audio levels are displayed in real-time on the popup UI, allowing users to visualize audio levels.

## Development Notes
- Using Web Audio API for audio processing, managed by the `AudioProcessor` class in `lib/audioProcessor.js`.
- Communication flow: `popup.js` (UI changes) -> `background.js` (settings storage, state management) -> `content.js` (applies settings to `AudioProcessor`).
- Following Chrome extension best practices (Manifest V3, service worker).
- UI simplified to a single-page layout focusing on core audio controls (Compressor, Limiter, Amplifier) and a global reset function.
- Privacy Policy (`privacy.md`) is set up to be hosted via GitHub Pages. (URL: `https://[your-username].github.io/[your-repo-name]/privacy.html` - *developer to confirm actual URL*).
- `activeTab` and `scripting` permissions are included in `manifest.json`; justifications provided for store submission, though primary scripting is via manifest-declared content scripts.

## Technical Details
- Audio Processing Chain: `MediaElementSource` -> `DynamicsCompressorNode` (Compressor) -> `DynamicsCompressorNode` (Limiter configured for fast attack/release) -> `GainNode` (Amplifier) -> `AnalyserNode` -> Destination.
- Settings are stored as a single object in `chrome.storage.local` under the key `audioSettings`.

## TODO
- [x] Set up basic extension structure (`manifest.json` created)
- [x] Implement audio processing core (`AudioProcessor` class in `lib/audioProcessor.js` created)
- [x] Create user interface (Single-page layout with core controls implemented)
- [x] Implement core settings storage (`chrome.storage.local` for current effect parameters)
- [] Implement Preset Management (Save, Load, Delete named sets of settings)
- [x] Add basic audio visualization (Decibel meter implemented)
- [] Add advanced audio visualization (Waveform and/or FFT spectrum using `AnalyserNode` data)
- [] Further enhance audio element detection and switching logic in `content.js` to reliably handle complex pages and user interactions (BUG related to InvalidStateError is now handled, but UX implications of stopping processing on reused elements should be considered).
- [] Add error handling and user feedback mechanisms more broadly across the extension.
- [] Create final extension icons.
- [ ] Add unit tests for key logic (e.g., `AudioProcessor` methods, settings management in `background.js`).
- [ ] Create comprehensive user documentation/help guide within the popup or linked from it.
- [ ] Add keyboard shortcuts for common actions (e.g., toggling effects, adjusting master gain if added).
- [ ] Consider audio device selection if multiple outputs are available and Web Audio API allows.

## Development Log
- Created `manifest.json` with basic extension configuration.
- Created placeholder files for `lib/audioProcessor.js`, `popup/popup.html`, `popup/popup.css`, `popup/js/popup.js`, `background/background.js`, `content/content.js`.
- Implemented `AudioProcessor` class in `lib/audioProcessor.js` with Web Audio API chain (Compressor, Limiter, Gain, Analyser) and parameter update methods.
- Implemented communication between popup, background, and content scripts for settings updates.
- Implemented `chrome.storage.local` for persisting current audio settings in `background.js`.
- Added "Reset to Defaults" functionality (button in popup, logic in background).
- UI Reorganization: Removed tabbed navigation in popup; all core controls (Compressor, Limiter, Amplifier) now on a single page.
- UI Simplification: Removed placeholder UI for Presets and Visualization sections to focus on core implemented features.
- UI Update: "Reset to Defaults" button moved to its own dedicated section for better visibility and layout.
- UX Change: Removed confirmation dialog for "Reset to Defaults" button, allowing for immediate action.
- Added `README.md`, `.gitignore`, MIT `LICENSE`, and `privacy.md` files to the project.
- Initial setup for hosting `privacy.md` via GitHub Pages discussed.
- **BUG**: Audio elements are sometimes not re-detected or re-processed correctly after DOM mutations or changes in media element state, leading to `AudioProcessor` disconnection or incorrect targeting. (Logged based on user reports and initial `content.js` observations).
- Attempted fix for `InvalidStateError` (HTMLMediaElement already connected): Modified `AudioProcessor.disconnect()` to fully close and nullify `AudioContext`, forcing a new context on re-initialization.
- Implemented a more robust fix for `InvalidStateError`: `content.js` now tracks `HTMLMediaElement`s that have had `createMediaElementSource` successfully called once (using a `WeakSet`). It will not attempt to re-initialize `MediaElementSourceNode` on the same DOM element if it has been processed before, thus avoiding the error when `src` attributes change on reused elements. This means audio processing will stop for a specific media player tag if the site reuses it for a new source, until a genuinely new media element is used by the page.
- Added Master Enable/Disable toggle: UI in popup, state management in background.js (persisted in storage), and content.js now respects this global state to start/stop audio detection and processing.
- Refined Master Enable/Disable: AudioProcessor now supports bypassing effects (setting nodes to neutral values) instead of full disconnection, allowing audio to continue playing while effects are toggled off. Content.js and background.js updated to use this new bypass mechanism.
- Implemented real-time decibel meter: Added `getDecibelLevel()` method to AudioProcessor, created communication chain from content script to popup, and designed visual meter UI. This allows users to see audio levels in real-time as sound plays through the browser.
- Improved decibel meter implementation: Replaced manual RMS-to-dB calculation with Web Audio API's native `getFloatFrequencyData()`, which directly provides frequency data in dBFS format. This leverages the browser's built-in audio analysis capabilities and provides more accurate readings with smoother response.
