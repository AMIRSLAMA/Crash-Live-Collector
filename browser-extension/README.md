# Crash Live Collector — Chrome capture extension

This folder contains the optional Chrome Manifest V3 capture bridge for the private Crash Live Collector.

## Install
1. Download the repository ZIP from GitHub and extract it.
2. In Chrome, open `chrome://extensions`.
3. Enable Developer mode, choose Load unpacked, and select this `browser-extension` folder.
4. Open the game page and use the extension popup to start capture, then reload the game tab.
5. Keep the SSH tunnel open on the same Windows computer:
   `ssh -N -L 3038:127.0.0.1:3038 amir@100.91.140.35`

The extension forwards only completed `OnCrash` results containing a round ID and numeric final multiplier. Other sanitized event metadata remains in local Chrome storage. No cookies, credentials, account identifiers, raw frames, or betting data are sent. It does not place bets or predict future results.

If the SSH tunnel is unavailable, local capture remains stored in Chrome; forwarding is retried only when another completed round event arrives.
