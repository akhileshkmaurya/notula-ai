import socketio
import time
import numpy as np
import asyncio

# Create a Socket.IO client
sio = socketio.Client()

@sio.event
def connect():
    print("✅ Connected to server")

@sio.event
def disconnect():
    print("❌ Disconnected from server")

@sio.event
def transcript(data):
    print(f"📝 Transcript received: {data['text']}")

def test_streaming():
    try:
        sio.connect('http://localhost:8000')
        
        print("🎤 Simulate streaming audio...")
        # Generate 5 seconds of silence/noise (just to test data flow)
        # In a real test, we'd load a wav file.
        # 16kHz, 16-bit mono = 32000 bytes per second
        
        # Create a simple sine wave (beep) to ensure it's valid audio
        sample_rate = 16000
        duration = 5 # seconds
        frequency = 440.0 # Hz
        
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        audio_data = (0.5 * np.sin(2 * np.pi * frequency * t) * 32767).astype(np.int16)
        
        chunk_size = 4096 # bytes
        audio_bytes = audio_data.tobytes()
        
        for i in range(0, len(audio_bytes), chunk_size):
            chunk = audio_bytes[i:i+chunk_size]
            sio.emit('audio_data', chunk)
            time.sleep(0.05) # Simulate real-time delay
            
        print("✅ Streaming complete. Waiting for final transcript...")
        time.sleep(5) # Wait for processing
        
        sio.disconnect()
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_streaming()
