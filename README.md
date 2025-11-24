# Notula AI

Notula AI is an intelligent meeting assistant that records audio, transcribes it in real-time using a cloud server, and generates AI-powered summaries with action items.

## Architecture
This application uses a **Client-Server** architecture:
- **Client (Electron)**: Captures system audio and microphone, streams it to the server, and displays the live transcript.
- **Server (Python/FastAPI)**: Receives audio stream, runs **Faster-Whisper** for transcription, and sends text back to the client.

## Features
- **🔐 Google Authentication**: Secure login with Google OAuth 2.0 for both client and server.
- **Real-time Transcription**: See the transcript as you speak.
- **Cloud-Based**: Offloads heavy AI processing to a server (Google Cloud / Oracle Cloud).
- **AI Summaries**: Generates Executive Summaries, Action Items, and Decisions using Google Gemini.
- **PDF Export**: Export meeting summaries to professional PDF reports.
- **Secure**: API keys and authentication tokens are managed via `.env`.

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

### 2. Client Setup

#### Authentication Setup (Required)
Before running the client, you must set up Google OAuth authentication. Follow the detailed guide:

**📖 [Authentication Setup Guide](AUTHENTICATION_SETUP.md)**

Quick steps:
1. Create Google OAuth credentials in Google Cloud Console
2. Copy `.env.example` to `.env` and add your credentials:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and add:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GEMINI_API_KEY=your_gemini_api_key
   ```

#### Install Dependencies
```bash
npm install
```

#### Configure Server URL
Open `main.js` and update `SERVER_URL` if your server is not at the default IP:
```javascript
const SERVER_URL = 'http://<YOUR_SERVER_IP>:8000';
```

## Usage

1.  **Start the Client**:
    ```bash
    npm start
    ```
2.  **Login**: Click **Sign in with Google** and authenticate with your Google account.
3.  **Record**: Click **Record Meeting**. The app will connect to the server and start streaming.
4.  **Live Transcript**: Watch the text appear in real-time.
5.  **Stop**: Click **End Meeting**.
6.  **Summarize**: Click **Generate AI Summary** to get insights.
7.  **Export**: Click **Export PDF** to save the report.

## Troubleshooting

### Authentication Issues
If you encounter login problems, see the **[Authentication Setup Guide](AUTHENTICATION_SETUP.md)** for detailed troubleshooting.

Common issues:
- **"Missing GOOGLE_CLIENT_ID"**: Ensure `.env` file exists with correct credentials
- **"Invalid redirect URI"**: Add `http://localhost:3000/callback` to Google Cloud Console
- **"Token verification failed"**: Check that server and client use the same GOOGLE_CLIENT_ID

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
