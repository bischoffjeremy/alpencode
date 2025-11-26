import torch
from transformers import pipeline
import numpy as np
import re
from scipy.io import wavfile
import json
import sys

class SwissTranscriber:
    def __init__(self, model_id):
        # 1. Hardware Detection
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if self.device == "cuda:0" else torch.float32
        
        print(json.dumps({"type": "status", "message": f"🚀 AI Init: Attempting to load on {self.device.upper()}..."}), flush=True)

        try:
            # 2. Versuch: Pipeline auf GPU (oder CPU wenn keine Nvidia da ist) laden
            self.pipe = pipeline(
                "automatic-speech-recognition", 
                model=model_id, 
                device=self.device, 
                torch_dtype=self.torch_dtype,
                chunk_length_s=30
            )
            print(json.dumps({"type": "status", "message": f"✅ AI Loaded on {self.device.upper()}"}), flush=True)

        except Exception as e:
            # 3. FALLBACK: Wenn GPU crasht (z.B. VRAM voll, falscher Treiber), auf CPU wechseln
            if "cuda" in self.device:
                print(json.dumps({"type": "status", "message": f"⚠️ GPU Error ({str(e)}). Switching to CPU Mode..."}), flush=True)
                
                self.device = "cpu"
                self.torch_dtype = torch.float32
                
                try:
                    self.pipe = pipeline(
                        "automatic-speech-recognition", 
                        model=model_id, 
                        device="cpu", 
                        torch_dtype=torch.float32,
                        chunk_length_s=30
                    )
                    print(json.dumps({"type": "status", "message": "✅ AI Loaded on CPU (Fallback)"}), flush=True)
                except Exception as fatal_e:
                    print(json.dumps({"type": "error", "message": f"Fatal AI Init Error: {fatal_e}"}), flush=True)
                    raise fatal_e
            else:
                # Wenn es schon auf CPU war und crasht, ist es ein echter Fehler
                print(json.dumps({"type": "error", "message": f"AI Init Failed: {e}"}), flush=True)
                raise e

    def transcribe(self, audio_bytes, save_path, silence_threshold=5):
        # Bytes zu Int16 Array konvertieren
        audio_data = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # RMS (Lautstärke) berechnen
        # 32768 ist der Max-Wert für 16bit Audio
        rms = np.sqrt(np.mean(audio_data.astype(float)**2)) / 32768 * 100
        
        if np.isnan(rms): return None
        
        # Level an UI senden (optional)
        # print(json.dumps({"type": "level", "value": int(rms), "threshold": silence_threshold}))
        # sys.stdout.flush()

        if rms < silence_threshold:
            return None
        
        # WICHTIG: Samplerate muss zur AudioEngine passen (AudioEngine.RATE = 16000)
        # Wenn hier 48000 steht, aber 16000 reinkommt, wird das Audio 3x zu schnell abgespielt.
        wavfile.write(save_path, 16000, audio_data)

        try:
            # Transkription starten
            result = self.pipe(
                save_path, 
                generate_kwargs={
                    "language": "de", 
                    "task": "transcribe",
                    "return_timestamps": True,
                    # Parameter gegen Wiederholungen
                    "repetition_penalty": 1.2,
                    "no_repeat_ngram_size": 3
                }
            )                   
            
            text = result['text'].strip() if isinstance(result, dict) else " ".join([c['text'] for c in result]).strip()

            if self._is_hallucination(text):
                return None

            return self._replace_common_errors(text)

        except Exception as e:
            print(json.dumps({"type": "error", "message": str(e)}), flush=True)
            return None

    def _is_hallucination(self, text):
        if not text: return True
        # Filtert Text, der sich unnatürlich oft wiederholt (Whisper Bug)
        if re.search(r'(.)\1{10,}', text): return True
        if re.search(r'(.{5,})\1{2,}', text): return True
        return False

    def _replace_common_errors(self, text):
        # Typische Fehlerkorrekturen für Coding/Tech Begriffe
        replacements = {
            "PrideProject": "pyproject",
            "MaxProject": "pyproject",
            "Rimini": "README",
            "Depensys": "Dependencies",
            "Jason": "JSON",
        }
        for wrong, right in replacements.items():
            # Case-Insensitive Replace wäre besser, aber simple reicht hier oft
            text = text.replace(wrong, right)
        return text