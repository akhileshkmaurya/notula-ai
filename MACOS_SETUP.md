# macOS Setup Guide (System + Microphone Audio)

This guide explains how to run the Notula AI Electron app on macOS with both microphone and system (speaker) audio captured.

## 1. Why Extra Setup Is Needed
Electron / Web APIs cannot directly tap speaker output on macOS. You must route system output through a virtual (loopback) audio device (e.g. BlackHole, Soundflower, Rogue Amoeba Loopback). Without this, only the microphone is captured or display capture may provide unreliable/incomplete audio.

## 2. Install a Loopback Device (BlackHole)
BlackHole (2‑channel) is free and sufficient.

```bash
brew install blackhole-2ch
```
If you do not have Homebrew, install it first (https://brew.sh).

## 3. Configure Audio Devices (Audio MIDI Setup)
Open the built‑in macOS app: Spotlight → "Audio MIDI Setup".

### A. Multi‑Output Device (for Hearing Audio While Routing It)
1. Click the + at the lower left → "Create Multi-Output Device".
2. In the right panel, check:
   - Your physical output (e.g. MacBook Pro Speakers, external headset) 
   - "BlackHole 2ch".
3. (Optional) Enable "Drift Correction" on the physical device if available.
4. In System Settings → Sound → Output, select the new "Multi-Output Device".
   - Now system sound plays normally but is also duplicated into BlackHole.

### B. Aggregate Device (Optional)
If you want *one* combined input that merges your microphone and BlackHole:
1. + → "Create Aggregate Device".
2. Check your microphone device and "BlackHole 2ch".
3. This new aggregate input can be chosen once instead of mixing two separate streams.
(You can skip this if you use the app's built-in mixing.)

## 4. App Permissions
macOS requires explicit permissions:
- Microphone: System Settings → Privacy & Security → Microphone → Enable for Electron/Notula.
- Screen Recording (only used if fallback display capture is attempted): System Settings → Privacy & Security → Screen Recording → Enable.
If prompted dialogs appear, grant access and restart the app if necessary.

## 5. Selecting Devices in the App
After launching Notula AI (`npm start`):
1. Open the main window (login if required).
2. In the controls section you will see two dropdowns:
   - System / Loopback Device
   - Microphone Device
3. Choose "BlackHole" (or your Aggregate Device) in the System / Loopback dropdown.
4. Choose your preferred microphone in the Microphone dropdown.
5. Click "Refresh Devices" if labels are blank (macOS sometimes hides labels until one `getUserMedia` call succeeds). The app performs a silent probe; re-open the dropdowns.
6. Press "Record Meeting".

If you do **not** select a loopback device on macOS the app will attempt `getDisplayMedia({audio:true})` as a fallback. This is often unreliable and may produce the warning: "Recording (system audio unavailable on this setup)".

## 6. Verifying Capture
- Play a YouTube video or music.
- Speak into the microphone.
- Watch the transcript populate with both spoken and system audio content.

## 7. Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| No system audio text | Loopback not selected or Multi-Output not active | Ensure Multi-Output device is chosen as system Output & BlackHole selected in app |
| Only mic captured | BlackHole install missing or not selected | Reinstall BlackHole; reselect in dropdown |
| Dropdown labels blank | macOS privacy gating | Click Refresh Devices; ensure microphone permission granted |
| Echo / feedback | Output routed back into input | Use Multi-Output only (not Aggregate) + separate mic; keep gain levels balanced |
| Distorted / clipped transcript | Mixed sources too loud | Adjust gain nodes in code (currently 0.7 each) or use Aggregate Device and single stream |

## 8. Advanced: Using an Aggregate Device
If you select your Aggregate Device as **System / Loopback** and also as **Microphone**, you will effectively feed the same combined stream twice. Prefer selecting it only once (e.g. System device) and leave Mic blank, or modify the code to skip mic capture when both IDs match.

## 9. Optional Native Alternative (Future Enhancement)
You could build a native Node/Electron module using CoreAudio APIs to tap the default output device directly without requiring a virtual loopback. Pros: simpler user onboarding. Cons: complexity (C++/Objective‑C bridge), code signing, maintenance, sandbox/entitlement considerations. Current solution keeps cross-platform parity with minimal native code.

## 10. Security & Privacy Notes
- Audio never stored locally beyond temporary chunks before upload.
- Selecting a loopback routes *all* system audio (notifications, music). Advise users to mute sensitive apps.

## 11. Summary of Required Steps
1. Install BlackHole.
2. Create Multi-Output (physical + BlackHole) and set as system output.
3. Grant microphone (and screen recording if needed) permissions.
4. Select BlackHole (or Aggregate) + microphone in app dropdowns.
5. Record meeting.

## 12. Uninstall / Revert
- To revert, set Output back to "MacBook Speakers" (or your usual device).
- Remove Multi-Output Device in Audio MIDI Setup.
- Uninstall BlackHole: `brew uninstall blackhole-2ch`.

---
If further automation is desired (e.g., auto-detection of BlackHole presence), we can extend the renderer to preselect it. Open an issue or request an enhancement.
