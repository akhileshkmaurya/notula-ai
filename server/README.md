# Notula AI - Transcription Server

This is the backend server for Notula AI, designed to handle real-time audio streaming and transcription using `faster-whisper`.

## Prerequisites
- Python 3.10+
- FFmpeg installed on the system.

## Local Setup

1.  **Create Virtual Environment**:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```

2.  **Install Dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Run Server**:
    ```bash
    python app.py
    ```
    The server will start on `http://localhost:8000`.

## Docker Deployment (Oracle Cloud)

1.  **Build Image**:
    ```bash
    docker build -t notula-server .
    ```

2.  **Run Container**:
    ```bash
    docker run -d -p 8000:8000 notula-server
    ```

3.  **Access Server**:
    ```bash
    docker stop notula-app
    docker rm notula-app
    docker build -t notula-server .
    docker run -d --name notula-app --restart unless-stopped -p 8000:8000 notula-server
    ```

## API
- **Socket.IO Endpoint**: `/`
- **Events**:
    - `connect`: Start session.
    - `audio_data`: Send binary PCM data (16kHz, 16-bit, Mono).
    - `transcript`: Receive text updates.
