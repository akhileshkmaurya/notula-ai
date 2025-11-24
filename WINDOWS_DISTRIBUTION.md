# Windows Distribution Guide

This guide explains how to package Notula AI for Windows users and details the changes made to support cross-platform compatibility.

## 🔄 Changes Made for Windows Support

1.  **Bundled FFmpeg**:
    *   Replaced the dependency on a system-installed `ffmpeg` with `ffmpeg-static`.
    *   The app now bundles the correct `ffmpeg.exe` binary automatically.
    *   **Why**: Users don't need to install FFmpeg manually anymore.

2.  **Cross-Platform Audio Capture**:
    *   **Linux**: Continues to use `PulseAudio` (`pactl` + `ffmpeg -f pulse`).
    *   **Windows**: Now uses `DirectShow` (`ffmpeg -f dshow`).
    *   **Logic**: The app detects the OS at runtime (`process.platform`) and chooses the correct recording method.

3.  **Electron Builder Configuration**:
    *   Added `build` section to `package.json`.
    *   Configured `nsis` target to create a standard Windows Installer (`.exe`).
    *   Configured `asarUnpack` to ensure `ffmpeg.exe` is accessible at runtime.

## 📦 How to Build for Windows

### Option 1: Build on Windows (Recommended)
The most reliable way to build a Windows app is to run the build command on a Windows machine.

1.  **Clone the repository** on Windows.
2.  **Install dependencies**:
    ```powershell
    npm install
    ```
3.  **Build the installer**:
    ```powershell
    npm run dist:win
    ```
4.  **Output**:
    *   The installer will be in the `dist/` folder (e.g., `Notula AI Setup 0.1.0.exe`).

### Option 2: Build on Linux (Cross-Compilation)
You can build the Windows `.exe` from your Linux machine.

1.  **Install Wine** (Required for setting the icon and some Windows-specific operations):
    ```bash
    sudo apt install wine
    ```
    *(If you don't have Wine, the build might still work but with a default icon or warnings)*

2.  **Run the build command**:
    ```bash
    npm run dist:win
    ```

3.  **Output**:
    *   Check the `dist/` folder for the `.exe` file.

## 🚀 How to Distribute

1.  **Locate the Installer**:
    *   Go to the `dist/` directory.
    *   Find the file named `Notula AI Setup X.X.X.exe`.

2.  **Share with Users**:
    *   Send this `.exe` file to your Windows users.
    *   They just need to double-click it to install.
    *   The app will handle installing dependencies (like FFmpeg) internally.

## ⚠️ Known Limitations on Windows

*   **Antivirus Warnings**:
    *   Since the app is not code-signed (which costs money), Windows Defender might show a "Unknown Publisher" warning. Users can click "More Info" -> "Run Anyway".

## 🛠 Troubleshooting

*   **"ffmpeg not found"**:
    *   The app uses `ffmpeg-static`. If this error occurs, ensure `node_modules` was not excluded from the build improperly. The `asarUnpack` setting in `package.json` handles this.
