# Notula AI

Notula AI is an intelligent meeting assistant that records audio, transcribes it in real-time using a cloud server, and generates AI-powered summaries with action items.

## Architecture
This application uses a **Client-Server** architecture:
- **Client (Electron)**: Captures system audio and microphone, streams it to the server, and displays the live transcript.
- **Server (Python/FastAPI)**: Receives audio stream, runs **Faster-Whisper** for transcription, and sends text back to the client.

## Features
- **Real-time Transcription**: See the transcript as you speak.
- **Cloud-Based**: Offloads heavy AI processing to a server (Google Cloud / Oracle Cloud).
- **AI Summaries**: Generates Executive Summaries, Action Items, and Decisions using Google Gemini.
- **PDF Export**: Export meeting summaries to professional PDF reports.
- **Secure**: API keys are managed via `.env`.

## Prerequisites

### Client
- Node.js 18+
- `ffmpeg` installed on the system.
- `pactl` (PulseAudio utils) installed (Linux).

### Server
- Python 3.10+
- Docker (for deployment).
- A cloud VM (e.g., Google Cloud e2-medium or Oracle Cloud Ampere A1).

---

## Setup & Installation

### 1. Server Setup
You must run the transcription server first.

**Local Run:**
```bash
cd server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

**Cloud Deployment:**
See the deployment guides:
- [Google Cloud Deployment](google_cloud_deployment.md)
- [Oracle Cloud Deployment](oracle_cloud_deployment.md)

### 2. Client Setup
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Configure Environment:
    Create a `.env` file in the root directory:
    ```
    GEMINI_API_KEY=your_google_ai_studio_key
    ```
3.  Configure Server URL:
    Open `main.js` and update `SERVER_URL` if your server is not at the default IP:
    ```javascript
    const SERVER_URL = 'http://<YOUR_SERVER_IP>:8000';
    ```

## Usage

1.  **Start the Client**:
    ```bash
    npm start
    ```
2.  **Record**: Click **Record Meeting**. The app will connect to the server and start streaming.
3.  **Live Transcript**: Watch the text appear in real-time.
4.  **Stop**: Click **End Meeting**.
5.  **Summarize**: Click **Generate AI Summary** to get insights.
6.  **Export**: Click **Export PDF** to save the report.

## Troubleshooting

### Server Disconnects
If the server disconnects frequently on a small VM (like e2-micro), it is likely running out of memory.
**Fix**: Enable Swap memory on the server.
```bash
sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

### No Audio / Flat Line
- Ensure you are playing audio or speaking.
- Check if `ffmpeg` is installed: `ffmpeg -version`.
- Linux: Ensure PulseAudio is running (`pactl info`).

## License
MIT
