import os
import io
import sys
import asyncio
import time
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from auth_middleware import get_current_user
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

# Configure minimal logging
logging.basicConfig(
    level=logging.WARNING,  # Only show warnings and errors from libraries
    format='%(message)s'
)

# Disable uvicorn access logs
logging.getLogger("uvicorn.access").disabled = True
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)

# Initialize FastAPI with minimal logging
app = FastAPI(docs_url=None, redoc_url=None)  # Disable docs to reduce overhead

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Whisper Model (only log once at startup)
# 'tiny.en' is much faster for English and suitable for CPU
# Initialize Whisper Model (only log once at startup)
# 'tiny.en' is much faster for English and suitable for CPU
# For multilingual support (e.g. Dutch), use 'tiny', 'base', or 'small'
MODEL_SIZE = os.getenv("WHISPER_MODEL", "tiny.en")
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "en")

# Limit threads to avoid contention on small VMs (e2-medium has 2 vCPUs)
# intra_threads=4 is good for latency on single request, but for concurrency on 2 cores,
# we should let the OS schedule. faster-whisper default is usually fine, but explicit is safer.
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8", cpu_threads=4)

@app.on_event("startup")
async def startup_event():
    """Print minimal startup confirmation"""
    timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    print(f"{timestamp} | SERVER_STARTED | model={MODEL_SIZE} | language={WHISPER_LANGUAGE} | threads=4", flush=True)

@app.get("/")
async def root():
    return {"message": "Notula AI Server is running (REST Mode)"}

class SummarizeRequest(BaseModel):
    transcript: str
    apiKey: str

@app.post("/summarize")
async def summarize_meeting(
    request: SummarizeRequest,
    current_user: dict = Depends(get_current_user)
):
    start_time = time.time()
    user_email = current_user.get('email', 'unknown')

    try:
        if not request.apiKey:
             raise HTTPException(status_code=400, detail="API Key is required")

        client = OpenAI(
            api_key=request.apiKey,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )

        prompt = f"""
You are an expert minute-taker. 
Please analyze the following meeting transcript and provide a structured summary.
Use EXACTLY these section headers (Markdown H2):
## Executive Summary
## Action Items
## Decisions

For Action Items, use bullet points.
For Decisions, use bullet points.

Transcript:
{request.transcript}
        """.strip()

        completion = client.chat.completions.create(
            model="gemini-flash-latest",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt}
            ]
        )

        summary = completion.choices[0].message.content
        
        response_time = time.time() - start_time
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        print(f"{timestamp} | {user_email} | SUMMARIZE | {response_time:.2f}s", flush=True)

        return {"summary": summary}

    except Exception as e:
        response_time = time.time() - start_time
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        print(f"{timestamp} | {user_email} | SUMMARIZE | {response_time:.2f}s | ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    start_time = time.time()
    user_email = current_user.get('email', 'unknown')
    
    try:
        # Read file content
        content = await file.read()
        audio_file = io.BytesIO(content)
        
        # Run transcription in a separate thread
        loop = asyncio.get_event_loop()
        segments, _ = await loop.run_in_executor(
            None, 
            lambda: list(model.transcribe(
                audio_file, 
                beam_size=1, 
                language=WHISPER_LANGUAGE, 
                vad_filter=True,
                temperature=0.0
            ))
        )

        # Collect text
        text = " ".join([segment.text for segment in segments]).strip()
        
        # Calculate response time
        response_time = time.time() - start_time
        
        # Minimal log: timestamp | user | response_time
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        print(f"{timestamp} | {user_email} | {response_time:.2f}s", flush=True)
        
        return {"text": text, "user": user_email}

    except Exception as e:
        response_time = time.time() - start_time
        timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        print(f"{timestamp} | {user_email} | {response_time:.2f}s | ERROR: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Disable uvicorn's default logging
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="warning",
        access_log=False
    )

