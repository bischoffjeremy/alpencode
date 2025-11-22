import torch
from transformers import pipeline
import pyaudio
import time
import os
import datetime
import numpy as np
from scipy.io import wavfile
import re
import sys
import platform
import json
import subprocess
from pathlib import Path
import threading
try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False

# Standard-Konfiguration
RATE = 48000
CHUNK = 4096
MODEL_ID = "Flurin17/whisper-large-v3-turbo-swiss-german"

# Globale Variablen
recording = False
monitoring = False
frames = []
stream = None
p = pyaudio.PyAudio()
device_index = None # Wird automatisch gewählt oder per Config gesetzt
silence_threshold = 5 # Default
audio_lock = threading.Lock()
original_volume = None

def get_current_volume():
    system = platform.system()
    try:
        if system == "Linux":
            # Versuche zuerst amixer
            result = subprocess.run(['amixer', 'get', 'Master'], capture_output=True, text=True)
            if result.returncode == 0:
                match = re.search(r'\[(\d+)%\]', result.stdout)
                if match:
                    return int(match.group(1))
            
            # Fallback zu pactl
            result = subprocess.run(['pactl', 'get-sink-volume', '@DEFAULT_SINK@'], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                match = re.search(r'/  (\d+)%', result.stdout)
                if match:
                    return int(match.group(1))
        elif system == "Windows":
            try:
                from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
                devices = AudioUtilities.GetSpeakers()
                interface = devices.Activate(IAudioEndpointVolume._iid_, 0, None)
                volume = interface.QueryInterface(IAudioEndpointVolume)
                return int(volume.GetMasterVolumeLevelScalar() * 100)
            except ImportError:
                pass
    except:
        pass
    return None

def set_volume(volume_percent):
    system = platform.system()
    try:
        if system == "Linux":
            # Versuche zuerst amixer (ALSA), da pactl (Pulse) manchmal Crashes verursacht
            result = subprocess.run(['amixer', 'set', 'Master', f'{volume_percent}%'], capture_output=True)
            if result.returncode == 0:
                return
            
            # Fallback zu pactl
            subprocess.run(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', f'{volume_percent}%'], 
                         capture_output=True)
        elif system == "Windows":
            try:
                from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
                devices = AudioUtilities.GetSpeakers()
                interface = devices.Activate(IAudioEndpointVolume._iid_, 0, None)
                volume = interface.QueryInterface(IAudioEndpointVolume)
                volume.SetMasterVolumeLevelScalar(volume_percent / 100.0, None)
            except ImportError:
                pass
    except:
        pass

def mute_system():
    try:
        global original_volume
        if original_volume is None:
            original_volume = get_current_volume()
            if original_volume is None:
                original_volume = 50
        set_volume(0)
    except Exception as e:
        print(json.dumps({"type": "error", "message": f"Mute Error: {e}"}))
        sys.stdout.flush()

def unmute_system():
    try:
        global original_volume
        if original_volume is not None:
            set_volume(original_volume)
            original_volume = None
    except Exception as e:
        print(json.dumps({"type": "error", "message": f"Unmute Error: {e}"}))
        sys.stdout.flush()

def get_config_dir():
    if platform.system() == "Windows":
        return Path(os.environ.get('APPDATA', Path.home())) / "SwissWhisper"
    else:
        return Path.home() / ".config" / "swiss_whisper"

def load_config():
    config_dir = get_config_dir()
    config_file = config_dir / "config.json"
    
    default_config = {
        "device_index": None,
        "save_folder": str(Path.home() / "SwissWhisper_Aufnahmen"),
        "model_id": MODEL_ID,
        "silence_threshold": 5
    }
    
    if config_file.exists():
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {**default_config, **config}
        except:
            pass
    
    return default_config

def save_config(config):
    config_dir = get_config_dir()
    config_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / "config.json"
    
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)

def setup_folders(save_folder):
    if not os.path.exists(save_folder):
        os.makedirs(save_folder)

def is_hallucination(text):
    if not text: return True
    if re.search(r'(.)\1{10,}', text): return True
    if re.search(r'(.{5,})\1{2,}', text): return True
    return False

def process_audio(audio_data, save_folder, pipe):
    global silence_threshold
    
    rms = np.sqrt(np.mean(audio_data.astype(float)**2)) / 32768 * 100
    
    if np.isnan(rms):
        return
    
    # Debug Output für Extension
    print(json.dumps({"type": "level", "value": int(rms), "threshold": silence_threshold}))
    sys.stdout.flush()

    if rms < silence_threshold:
        return
    
    timestamp = datetime.datetime.now().strftime("%H-%M-%S")
    filename = os.path.join(save_folder, f"rec_{timestamp}.wav")
    wavfile.write(filename, RATE, audio_data)

    try:
        result = pipe(
            filename, 
            generate_kwargs={
                "language": "de", 
                "task": "transcribe",
                "return_timestamps": True,
                "repetition_penalty": 1.2,
                "no_repeat_ngram_size": 3
            }
        )                
        if isinstance(result, dict):
            text = result['text'].strip()
        else:
            text = " ".join([c['text'] for c in result]).strip()

        if is_hallucination(text):
            return

        replacements = {
            "PrideProject": "pyproject",
            "MaxProject": "pyproject",
            "Rimini": "README",
            "Depensys": "Dependencies",
        }
        for wrong, right in replacements.items():
            text = text.replace(wrong, right)

        if text and len(text) > 1:
            # WICHTIG: Output für VS Code Extension
            print(json.dumps({"type": "transcription", "text": text}))
            sys.stdout.flush()

    except Exception as e:
        print(json.dumps({"type": "error", "message": str(e)}))
        sys.stdout.flush()

def record_loop():
    global recording, stream, frames
    while recording:
        with audio_lock:
            if not stream: break
            try:
                data = stream.read(CHUNK, exception_on_overflow=False)
                frames.append(data)
            except IOError:
                pass
            except Exception as e:
                print(json.dumps({"type": "error", "message": f"Stream Error: {e}"}))
                sys.stdout.flush()
                break

def monitor_loop():
    global monitoring, stream, silence_threshold
    while monitoring:
        with audio_lock:
            if not stream: break
            try:
                data = stream.read(CHUNK, exception_on_overflow=False)
                audio_chunk = np.frombuffer(data, dtype=np.int16)
                rms = np.sqrt(np.mean(audio_chunk.astype(float)**2)) / 32768 * 100
                if not np.isnan(rms):
                    print(json.dumps({"type": "calibration_level", "value": int(rms)}))
                    sys.stdout.flush()
            except: pass

def main():
    global recording, monitoring, frames, stream, device_index, silence_threshold, p
    
    print(json.dumps({"type": "status", "message": "Initializing..."}))
    sys.stdout.flush()
    
    config = load_config()
    save_folder = config['save_folder']
    setup_folders(save_folder)
    
    device_index = config.get('device_index')
    silence_threshold = config.get('silence_threshold', 5)

    # KI Laden
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(json.dumps({"type": "status", "message": f"Loading AI on {device}..."}))
    sys.stdout.flush()
    
    try:
        pipe = pipeline(
            "automatic-speech-recognition", 
            model=config['model_id'], 
            device=device,
            chunk_length_s=30
        )
        print(json.dumps({"type": "ready", "message": "AlpenCode Ready"}))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"type": "error", "message": f"Failed to load model: {e}"}))
        sys.stdout.flush()
        return

    # Main Loop: Liest Befehle von stdin (von VS Code Extension)
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            
            command = line.strip()
            
            if command == "start":
                if not recording:
                    recording = True
                    mute_system()
                    monitoring = False
                    frames = []
                    try:
                        with audio_lock:
                            if stream:
                                try:
                                    stream.stop_stream()
                                    stream.close()
                                except: pass
                            
                            # Reload config to get latest device
                            config = load_config()
                            device_index = config.get('device_index')
                            
                            stream = p.open(format=pyaudio.paInt16, 
                                            channels=1, 
                                            rate=RATE, 
                                            input=True, 
                                            input_device_index=device_index,
                                            frames_per_buffer=CHUNK)
                        
                        print(json.dumps({"type": "status", "message": "Recording started"}))
                        sys.stdout.flush()
                        
                        # Start Audio Processing Thread
                        threading.Thread(target=record_loop, daemon=True).start()
                        
                    except Exception as e:
                        print(json.dumps({"type": "error", "message": f"Mic Error: {e}"}))
                        sys.stdout.flush()
                        recording = False

            elif command == "stop":
                if recording:
                    recording = False
                    unmute_system()
                    with audio_lock:
                        if stream:
                            try:
                                stream.stop_stream()
                                stream.close()
                            except: pass
                        stream = None
                    
                    print(json.dumps({"type": "status", "message": "Processing..."}))
                    sys.stdout.flush()
                    
                    if len(frames) > 0:
                        raw_data = b''.join(frames)
                        audio_data = np.frombuffer(raw_data, dtype=np.int16)
                        process_audio(audio_data, save_folder, pipe)
                    
                    frames = []

            elif command == "start_monitor":
                if not recording and not monitoring:
                    monitoring = True
                    try:
                        with audio_lock:
                            if stream:
                                try:
                                    stream.stop_stream()
                                    stream.close()
                                except: pass
                            
                            config = load_config()
                            device_index = config.get('device_index')
                            
                            # Debug: Log welche Device geöffnet wird
                            dev_name = "Default"
                            try:
                                if device_index is not None:
                                    info = p.get_device_info_by_index(device_index)
                                    dev_name = info.get('name', 'Unknown')
                            except: pass
                            print(json.dumps({"type": "status", "message": f"Öffne Audio Stream auf Gerät {device_index}: {dev_name}"}))
                            sys.stdout.flush()
                            
                            stream = p.open(format=pyaudio.paInt16, 
                                            channels=1, 
                                            rate=RATE, 
                                            input=True, 
                                            input_device_index=device_index,
                                            frames_per_buffer=CHUNK)
                        
                        threading.Thread(target=monitor_loop, daemon=True).start()
                        
                    except Exception as e:
                        print(json.dumps({"type": "error", "message": f"Monitor Error: {e}"}))
                        sys.stdout.flush()

            elif command == "stop_monitor":
                monitoring = False
                with audio_lock:
                    if stream and not recording:
                        try:
                            stream.stop_stream()
                            stream.close()
                        except: pass
                        stream = None

            elif command == "list_devices":
                # Nicht neu initialisieren von PyAudio um PulseAudio Abstürze zu vermeiden
                if not recording and not monitoring:
                    devices = []
                    try:
                        cnt = p.get_device_count()
                        for i in range(cnt):
                            try:
                                info = p.get_device_info_by_index(i)
                                if info['maxInputChannels'] > 0:
                                    devices.append({"index": i, "name": info['name']})
                            except: pass
                    except Exception as e:
                        print(json.dumps({"type": "error", "message": f"List Devices Error: {e}"}))
                    
                    print(json.dumps({"type": "devices", "devices": devices}))
                sys.stdout.flush()

            elif command.startswith("set_device "):
                try:
                    idx = int(command.split(" ")[1])
                    config['device_index'] = idx
                    save_config(config)
                    device_index = idx
                    
                    # Gerätename zur Bestätigung abrufen
                    dev_name = "Unknown"
                    try:
                        info = p.get_device_info_by_index(idx)
                        dev_name = info.get('name', 'Unknown')
                    except: pass
                    
                    print(json.dumps({"type": "status", "message": f"Gerät {idx} ausgewählt: {dev_name}"}))
                    sys.stdout.flush()
                    
                    # Monitor neu starten wenn aktiv
                    if monitoring:
                        monitoring = False
                        with audio_lock:
                            if stream:
                                try:
                                    stream.stop_stream()
                                    stream.close()
                                except: pass
                            stream = None
                        time.sleep(0.1)
                        # Frontend sollte es neu starten
                        
                except Exception as e:
                    print(json.dumps({"type": "error", "message": f"Set Device Error: {e}"}))
                    sys.stdout.flush()

            elif command == "calibrate":
                try:
                    print(json.dumps({"type": "status", "message": "Kalibriere..."}))
                    sys.stdout.flush()
                    
                    # Konfiguration neu laden
                    config = load_config()
                    device_index = config.get('device_index')
                    
                    calib_stream = p.open(format=pyaudio.paInt16, channels=1, rate=RATE, input=True, 
                                    input_device_index=device_index, frames_per_buffer=CHUNK)
                    
                    calib_frames = []
                    # 3 Sekunden aufnehmen
                    for _ in range(0, int(RATE / CHUNK * 3)):
                        data = calib_stream.read(CHUNK, exception_on_overflow=False)
                        calib_frames.append(data)
                        # Optional: Live-Pegel senden
                        audio_chunk = np.frombuffer(data, dtype=np.int16)
                        rms_chunk = np.sqrt(np.mean(audio_chunk.astype(float)**2)) / 32768 * 100
                        if not np.isnan(rms_chunk):
                            print(json.dumps({"type": "calibration_level", "value": int(rms_chunk)}))
                            sys.stdout.flush()

                    calib_stream.stop_stream()
                    calib_stream.close()

                    raw_data = b''.join(calib_frames)
                    audio_data = np.frombuffer(raw_data, dtype=np.int16)
                    
                    if len(audio_data) == 0:
                        print(json.dumps({"type": "error", "message": "Keine Audiodaten empfangen"}))
                    else:
                        rms = np.sqrt(np.mean(audio_data.astype(float)**2)) / 32768 * 100
                        if np.isnan(rms): rms = 0
                        
                        suggestion = max(1, int(rms * 0.7)) if rms > 0 else 5
                        if rms < 1: suggestion = 1
                        
                        print(json.dumps({
                            "type": "calibration_result", 
                            "rms": int(rms), 
                            "suggestion": suggestion
                        }))
                        sys.stdout.flush()

                except Exception as e:
                    print(json.dumps({"type": "error", "message": f"Calibration Error: {e}"}))
                    sys.stdout.flush()

            elif command.startswith("set_threshold "):
                try:
                    val = int(command.split(" ")[1])
                    config['silence_threshold'] = val
                    save_config(config)
                    silence_threshold = val
                    print(json.dumps({"type": "status", "message": f"Schwelle auf {val} gesetzt"}))
                    sys.stdout.flush()
                except Exception as e:
                    print(json.dumps({"type": "error", "message": f"Set Threshold Error: {e}"}))
                    sys.stdout.flush()

            elif command == "press_enter":
                if PYAUTOGUI_AVAILABLE:
                    try:
                        pyautogui.press('enter')
                        # print(json.dumps({"type": "status", "message": "Pressed Enter"}))
                    except Exception as e:
                        print(json.dumps({"type": "error", "message": f"Key Error: {e}"}))
                else:
                    print(json.dumps({"type": "error", "message": "pyautogui missing. Please Reset Env."}))
                sys.stdout.flush()

            elif command == "quit":
                break
                
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(json.dumps({"type": "error", "message": str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
