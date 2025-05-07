Privacy Policy for Audio Manager Chrome Extension

Last Updated: [7/05/2025]

This Privacy Policy describes how the Audio Manager Chrome Extension ("the Extension") handles information.

1.  **Information We Do Not Collect:**
    The Extension does **not** collect, store, or transmit any:
    *   Personally Identifiable Information (PII) such as your name, address, email, age, or identification number.
    *   Health, financial, or authentication information.
    *   Personal communications.
    *   Location data or IP addresses.
    *   Web browsing history.
    *   General user activity on websites (clicks, mouse movements, keystrokes not related to the extension's UI).

2.  **Information We Use (Locally):**
    *   **User Audio Settings:** The Extension uses `chrome.storage.local` to save your preferred audio settings (e.g., compressor, limiter, amplifier parameters). This data is stored only on your local computer and is not transmitted to any external server or third party. It is used solely to provide a consistent experience by remembering your settings across sessions.
    *   **Website Media Elements:** The Extension's content script interacts with `<audio>` and `<video>` HTML elements on the web pages you visit. This interaction is limited to identifying these elements and applying your chosen audio settings to their audio output using the Web Audio API. The Extension does not collect or store the content of these media elements or any other part of the websites you visit.

3.  **Permissions:**
    The Extension requires the following permissions, for the reasons stated:
    *   `storage`: To save your audio settings locally.
    *   `<all_urls>` (Host Permission for Content Scripts): To find and apply audio settings to media elements on any website you visit.
    *   `activeTab`, `scripting`: For interacting with the active tab and managing scripts for audio processing.

4.  **Data Security:**
    Settings stored locally are protected by the security measures of your Chrome browser.

5.  **Changes to This Privacy Policy:**
    We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy within the extension's web store listing or on our website.

6.  **Contact Us:**
    If you have any questions about this Privacy Policy, please contact us at [marcusbloomfield3@gmail.com].