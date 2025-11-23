import torch
from transformers import pipeline
import numpy as np
import re
from scipy.io import wavfile
import json
import sys

class SwissTranscriber:
    def __init__(self, model_id):
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.pipe = pipeline(
            "automatic-speech-recognition", 
            model=model_id, 
            device=self.device, 
            chunk_length_s=30
        )

    def transcribe(self, audio_bytes, save_path, silence_threshold=5):
        audio_data = np.frombuffer(audio_bytes, dtype=np.int16)
        
        # Level Check
        rms = np.sqrt(np.mean(audio_data.astype(float)**2)) / 32768 * 100
        if np.isnan(rms): return None
        
        print(json.dumps({"type": "level", "value": int(rms), "threshold": silence_threshold}))
        sys.stdout.flush()

        if rms < silence_threshold:
            return None
        
        # Save & Transcribe
        wavfile.write(save_path, 48000, audio_data)

        try:
            result = self.pipe(
                save_path, 
                generate_kwargs={
                    "language": "de", 
                    "task": "transcribe",
                    "return_timestamps": True,
                    "repetition_penalty": 1.2,
                    "no_repeat_ngram_size": 3
                }
            )                
            
            text = result['text'].strip() if isinstance(result, dict) else " ".join([c['text'] for c in result]).strip()

            if self._is_hallucination(text):
                return None

            return self._replace_common_errors(text)

        except Exception as e:
            print(json.dumps({"type": "error", "message": str(e)}))
            sys.stdout.flush()
            return None

    def _is_hallucination(self, text):
        if not text: return True
        if re.search(r'(.)\1{10,}', text): return True
        if re.search(r'(.{5,})\1{2,}', text): return True
        return False

    def _replace_common_errors(self, text):
        replacements = {
            "PrideProject": "pyproject",
            "MaxProject": "pyproject",
            "Rimini": "README",
            "Depensys": "Dependencies",
        }
        for wrong, right in replacements.items():
            text = text.replace(wrong, right)
        return text