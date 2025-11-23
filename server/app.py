import os
import io
import asyncio
import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

# Initialize FastAPI
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Whisper Model
# 'tiny' or 'base' is recommended for real-time on CPU. 
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
print(f"Loading Whisper model: {MODEL_SIZE}...")
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
print("Whisper model loaded.")

@app.get("/")
async def root():
    return {"message": "Notula AI Server is running (REST Mode)"}

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        # Read file content
        content = await file.read()
        
        # Convert to numpy array
        # We assume the client sends a valid WAV file (16kHz, 16-bit, Mono)
        # or we can let faster-whisper handle the decoding from the bytes directly if we write to a temp file
        # or use a BytesIO object. faster-whisper accepts a file-like object or path.
        
        audio_file = io.BytesIO(content)
        
        # Run transcription in a separate thread
        loop = asyncio.get_event_loop()
        print("Starting transcription (beam_size=1, language=en, vad=True)...")
        segments, _ = await loop.run_in_executor(
            None, 
            lambda: list(model.transcribe(
                audio_file, 
                beam_size=1, 
                language="en", 
                vad_filter=True,
                temperature=0.0
            ))
        )

        # Collect text
        text = " ".join([segment.text for segment in segments]).strip()
        
        print(f"Transcribed: {text}")
        return {"text": text}

    except Exception as e:
        print(f"Error during transcription: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
