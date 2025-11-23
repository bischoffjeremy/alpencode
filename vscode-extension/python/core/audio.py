import pyaudio
import numpy as np
import threading
import json
import sys
import queue
import time

class AudioEngine:
    RATE = 48000
    CHUNK = 4096
    MAX_DURATION = 60 

    def __init__(self):
        self.p = None 
        self.stream = None
        self.frames = []
        self.recording = False
        self.monitoring = False
        self.lock = threading.Lock()
        self.audio_queue = queue.Queue()
        
        self.silence_counter = 0      # Für Streaming Schnitt (kurz)
        self.auto_stop_counter = 0    # Für Auto Stop (lang/absolut)
        
        self.speech_detected = False
        self.streaming_mode = False
        self.cut_pause_chunks = 0
        self.stop_pause_chunks = 0

    def _ensure_pyaudio(self):
        if self.p is None: self.p = pyaudio.PyAudio()

    def list_devices(self):
        self._ensure_pyaudio()
        devices = []
        try:
            cnt = self.p.get_device_count()
            for i in range(cnt):
                try:
                    info = self.p.get_device_info_by_index(i)
                    if info['maxInputChannels'] > 0:
                        devices.append({"index": i, "name": info['name']})
                except: pass
        except: pass
        return devices

    def start_recording(self, device_index, silence_threshold, streaming=False, stream_pause_ms=500, stop_pause_s=3.0):
        self._ensure_pyaudio()
        self._stop_stream()
        self.frames = []
        self.recording = True
        self.monitoring = False
        
        # RESET ALL COUNTERS
        self.silence_counter = 0
        self.auto_stop_counter = 0
        self.speech_detected = False 
        self.streaming_mode = streaming
        
        chunks_per_sec = self.RATE / self.CHUNK
        self.cut_pause_chunks = int(chunks_per_sec * (float(stream_pause_ms) / 1000.0))
        self.stop_pause_chunks = int(chunks_per_sec * float(stop_pause_s))
        
        # INFO LOG
        print(json.dumps({"type": "status", "message": f"Audio Config: Thresh={silence_threshold}, AutoStop={self.stop_pause_chunks} chunks"}), flush=True)
        
        with self.audio_queue.mutex:
            self.audio_queue.queue.clear()
            
        try:
            self._start_stream(device_index, lambda: self._record_loop(silence_threshold))
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Mic Error: {e}"}))
            sys.stdout.flush()
            self.recording = False

    def stop_recording(self):
        was_rec = self.recording
        self.recording = False
        self._stop_stream()
        
        if was_rec and len(self.frames) > 0 and self.speech_detected:
            self.audio_queue.put(b''.join(self.frames))
        
        self.frames = []

    def _record_loop(self, threshold):
        chunks_max = int((self.RATE / self.CHUNK) * self.MAX_DURATION)
        chunks_per_sec = self.RATE / self.CHUNK
        log_timer = 0

        while self.recording:
            with self.lock:
                if not self.stream: break
                try:
                    data = self.stream.read(self.CHUNK, exception_on_overflow=False)
                    self.frames.append(data)
                    rms = self.calculate_rms(data)

                    # --- LOGGING (Jede Sekunde) ---
                    log_timer += 1
                    if log_timer % int(chunks_per_sec) == 0:
                         silence_sec = self.auto_stop_counter / chunks_per_sec
                         print(json.dumps({
                             "type": "status", 
                             "message": f"🎤 Level: {rms:.2f} | Thresh: {threshold} | AutoStop-Counter: {silence_sec:.1f}s"
                         }), flush=True)

                    # --- VAD & COUNTER LOGIK ---
                    
                    if rms > threshold:
                        # --- ES IST LAUT ---
                        self.speech_detected = True
                        self.silence_counter = 0     # Reset Schnitt Timer
                        self.auto_stop_counter = 0   # Reset Stop Timer
                    else:
                        # --- ES IST LEISE ---
                        self.auto_stop_counter += 1  # Zählt IMMER hoch wenn leise (WICHTIG!)

                        if self.speech_detected:
                            self.silence_counter += 1 # Zählt nur hoch, wenn wir mitten im Satz sind
                        else:
                            if len(self.frames) > 15: self.frames.pop(0)
                            self.silence_counter = 0

                    # --- ENTSCHEIDUNGEN ---
                    
                    # 1. AUTO STOP (Hat Priorität, greift auch wenn speech_detected False ist, solange es still ist)
                    if self.streaming_mode and self.auto_stop_counter > self.stop_pause_chunks:
                        print(json.dumps({"type": "status", "message": "🛑 AUTO-STOP TRIGGERED (Silence Limit Reached)"}), flush=True)
                        
                        self.audio_queue.put(b''.join(self.frames))
                        self.audio_queue.put("CMD_STOP")
                        self.recording = False
                        break

                    # 2. STREAMING SCHNITT (Nur wenn wir gerade sprechen)
                    if self.streaming_mode and self.speech_detected and (self.silence_counter > self.cut_pause_chunks):
                        cut_idx = len(self.frames) - int(self.cut_pause_chunks / 2)
                        if cut_idx > 0:
                            chunk = b''.join(self.frames[:cut_idx])
                            self.audio_queue.put(chunk)
                            # Reset Frames und Speech detected -> Das hat vorher den Auto-Stop gekillt
                            self.frames = self.frames[cut_idx:]
                            self.silence_counter = 0
                            self.speech_detected = False 
                            # ABER: auto_stop_counter läuft weiter, da es ja leise ist!

                    # Notbremse (Hard Limit)
                    if len(self.frames) > chunks_max:
                        self.audio_queue.put(b''.join(self.frames))
                        self.frames = []
                        self.speech_detected = False
                
                except Exception as e: 
                    print(json.dumps({"type": "error", "message": str(e)}))
                    break
        self._stop_stream()

    def start_monitoring(self, dev_idx):
        self._ensure_pyaudio()
        if self.monitoring: self.stop_monitoring()
        if not self.recording:
            self.monitoring = True
            try: self._start_stream(dev_idx, self._monitor_loop)
            except: self.monitoring = False

    def stop_monitoring(self):
        self.monitoring = False
        if not self.recording: self._stop_stream()

    def get_queue(self): return self.audio_queue

    def _start_stream(self, idx, target):
        with self.lock:
            self.stream = self.p.open(format=pyaudio.paInt16, channels=1, rate=self.RATE, input=True, input_device_index=idx, frames_per_buffer=self.CHUNK)
        threading.Thread(target=target, daemon=True).start()

    def _stop_stream(self):
        with self.lock:
            if self.stream:
                try: self.stream.stop_stream(); self.stream.close()
                except: pass
                self.stream = None

    def _monitor_loop(self):
        while self.monitoring:
            with self.lock:
                if not self.stream: break
                try:
                    d = self.stream.read(self.CHUNK, exception_on_overflow=False)
                    print(json.dumps({"type": "calibration_level", "value": self.calculate_rms(d)}), flush=True)
                except: break
    
    @staticmethod
    def calculate_rms(raw):
        try:
            data = np.frombuffer(raw, dtype=np.int16)
            rms = np.sqrt(np.mean(data.astype(float)**2)) / 32768 * 100
            return 0.0 if np.isnan(rms) else round(float(rms), 2)
        except: return 0.0