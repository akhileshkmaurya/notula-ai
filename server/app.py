import os
import io
import asyncio
import numpy as np
import socketio
from fastapi import FastAPI
from faster_whisper import WhisperModel
import wave

# Initialize FastAPI and Socket.IO
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Notula AI Server is running"}

# Wrap FastAPI with Socket.IO
combined_app = socketio.ASGIApp(sio, app)

# Initialize Whisper Model
# 'tiny' or 'base' is recommended for real-time on CPU. 
# 'small' or 'medium' if you have more powerful hardware.
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
print(f"Loading Whisper model: {MODEL_SIZE}...")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
print("Whisper model loaded.")

# Store active sessions and their audio buffers
sessions = {}

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")
    sessions[sid] = {
        "audio_buffer": bytearray(),
        "file_path": f"recording_{sid}.wav",
        "wave_file": None
    }
    
    # Open WAV file for writing
    wav_file = wave.open(sessions[sid]["file_path"], "wb")
    wav_file.setnchannels(1) # Mono
    wav_file.setsampwidth(2) # 16-bit
    wav_file.setframerate(16000) # 16kHz
    sessions[sid]["wave_file"] = wav_file

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")
    if sid in sessions:
        # Close WAV file
        if sessions[sid]["wave_file"]:
            sessions[sid]["wave_file"].close()
        
        # Clean up session
        del sessions[sid]

@sio.event
async def audio_data(sid, data):
    """
    Receive raw PCM audio data (16kHz, 16-bit, Mono).
    """
    if sid not in sessions:
        return

    session = sessions[sid]
    
    # Write to WAV file
    if session["wave_file"]:
        session["wave_file"].writeframes(data)

    # Append to buffer for transcription
    session["audio_buffer"].extend(data)
    
    # Process buffer if it's large enough
    # User requested ~10 seconds to reduce server load
    # 10 seconds * 16000 Hz * 2 bytes = 320,000 bytes
    THRESHOLD_BYTES = 320000 
    
    if len(session["audio_buffer"]) >= THRESHOLD_BYTES:
        await process_transcription(sid)

async def process_transcription(sid):
    if sid not in sessions:
        return

    session = sessions[sid]
    raw_data = session["audio_buffer"]
    
    # Convert bytearray to numpy array for Whisper
    # 16-bit PCM -> float32 normalized to [-1, 1]
    audio_np = np.frombuffer(raw_data, dtype=np.int16).astype(np.float32) / 32768.0
    
    # Clear buffer (or keep some overlap if needed for context - advanced)
    # For simple streaming, we clear it. 
    # NOTE: Real-time streaming usually requires a sliding window or VAD. 
    # This is a simplified implementation.
    session["audio_buffer"] = bytearray()

    # Run transcription in a separate thread to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    segments, _ = await loop.run_in_executor(None, lambda: list(model.transcribe(audio_np, beam_size=5)))

    # Collect text
    text = " ".join([segment.text for segment in segments]).strip()
    
    if text:
        print(f"Transcript [{sid}]: {text}")
        await sio.emit('transcript', {'text': text}, room=sid)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(combined_app, host="0.0.0.0", port=8000)
