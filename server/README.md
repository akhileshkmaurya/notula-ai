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

## Easy Deployment (Update)

To update the server code without manually SSH-ing:

1.  **Setup SSH Access**: Follow the [SSH Setup Guide](../ssh_setup_guide.md) to connect from your local machine.
2.  **Configure Script**: Open `deploy.sh` and update `REMOTE_USER` and `KEY_PATH`.
3.  **Run Script**:
    ```bash
    ./deploy.sh
    ```
    This will copy the files, rebuild the Docker image, and restart the container automatically.

## API
- **Endpoint**: `POST /transcribe`
- **Input**: `multipart/form-data` with `file` (WAV audio).
- **Output**: JSON `{ "text": "Transcribed text..." }`
