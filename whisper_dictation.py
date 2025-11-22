import torch
from transformers import pipeline
import pyaudio
from pynput import keyboard
import pyautogui
import pyperclip
import time
import subprocess
import os
import datetime
import numpy as np
from scipy.io import wavfile
import re
import sys
import platform
import json
from pathlib import Path
import tkinter as tk
from tkinter import font
import threading

RATE = 48000
CHUNK = 4096
MODEL_ID = "Flurin17/whisper-large-v3-turbo-swiss-german"

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
        "silence_threshold": None
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

def send_notification(title, message):
    def show_notification():
        root = tk.Tk()
        root.attributes("-topmost", True)
        root.geometry("300x80+10+10")
        root.overrideredirect(True)
        root.configure(bg='black')
        
        label = tk.Label(root, text=f"🎙️ {message}", font=("Arial", 14), fg='white', bg='black')
        label.pack(pady=20)
        
        root.after(2000, root.destroy)
        root.mainloop()
    
    system = platform.system()
    try:
        if system in ["Linux", "Windows"]:
            threading.Thread(target=show_notification, daemon=True).start()
        elif system == "Darwin":
            subprocess.Popen(['osascript', '-e', f'display notification "{message}" with title "{title}"'],
                             stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    except: 
        pass

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
        print(f"Warnung: Konnte System nicht stummschalten: {e}")

def unmute_system():
    try:
        global original_volume
        if original_volume is not None:
            set_volume(original_volume)
            original_volume = None
    except Exception as e:
        print(f"Warnung: Konnte Lautstärke nicht wiederherstellen: {e}")

def type_text_via_clipboard(text):
    try:
        pyperclip.copy(text)
        time.sleep(0.05)
        pyautogui.hotkey('ctrl', 'v')
    except: pass

def is_hallucination(text):
    if not text: return True
    if re.search(r'(.)\1{10,}', text): return True
    if re.search(r'(.{5,})\1{2,}', text): return True
    return False

def list_audio_devices():
    p = pyaudio.PyAudio()
    print("\n" + "="*50)
    print("   VERFÜGBARE AUDIO-GERÄTE")
    print("="*50)
    
    device_count = p.get_device_count()
    input_devices = []
    
    for i in range(device_count):
        try:
            info = p.get_device_info_by_index(i)
            if info['maxInputChannels'] > 0:
                input_devices.append((i, info))
                print(f"[{i}] {info['name']}")
                print(f"    Kanäle: {info['maxInputChannels']}, Rate: {int(info['defaultSampleRate'])} Hz")
        except:
            pass
    
    p.terminate()
    print("="*50)
    return input_devices

def select_audio_device(config):
    if config.get('device_index') is not None:
        return config['device_index']
    
    devices = list_audio_devices()
    
    if not devices:
        print("⚠️ Keine Eingabegeräte gefunden!")
        return None
    
    while True:
        choice = input(f"\n👉 Wählen Sie ein Gerät [0-{len(devices)-1}]: ")
        if choice.isdigit() and int(choice) in [d[0] for d in devices]:
            device_index = int(choice)
            save = input("💾 Diese Auswahl speichern? (j/n): ")
            if save.lower() in ['j', 'y', 'yes', 'ja']:
                config['device_index'] = device_index
                save_config(config)
                print("✅ Gespeichert!")
            return device_index
        print("❌ Ungültige Auswahl!")

def calibrate_microphone(p, device_index):
    print("\n" + "="*40)
    print("   MIKROFON KALIBRIERUNG")
    print("="*40)
    print("Wir messen kurz Ihre Lautstärke, um den Filter einzustellen.")
    input("👉 Drücken Sie [ENTER] und sprechen Sie sofort einen Satz...")

    try:
        stream = p.open(format=pyaudio.paInt16, channels=1, rate=RATE, input=True, 
                        input_device_index=device_index, frames_per_buffer=CHUNK)
    except Exception as e:
        print(f"Fehler beim Öffnen des Mikrofons: {e}")
        return 50

    print("🎤 AUFNAHME LÄUFT (3 Sekunden)... Bitte sprechen!")
    
    mute_system()
    
    frames = []
    for _ in range(0, int(RATE / CHUNK * 3)):
        data = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(data)
        print(".", end="", flush=True)

    print("\n🛑 Fertig.")
    unmute_system()
    stream.stop_stream()
    stream.close()

    raw_data = b''.join(frames)
    audio_data = np.frombuffer(raw_data, dtype=np.int16)
    
    if len(audio_data) == 0:
        print("\n❌ FEHLER: Keine Audiodaten empfangen!")
        return 50
    
    rms = np.sqrt(np.mean(audio_data.astype(float)**2)) / 32768 * 100
    peak = np.max(np.abs(audio_data)) / 32768 * 100
    
    if np.isnan(rms) or rms == 0:
        print("\n⚠️ WARNUNG: Mikrofon scheint keine gültigen Daten zu liefern!")
        rms = 0
        peak = 0
    
    print(f"\n📊 ERGEBNIS:")
    print(f"   Durchschnitts-Pegel (RMS): {int(rms) if not np.isnan(rms) else 'N/A'}")
    print(f"   Spitzen-Pegel (Peak):      {peak}")

    suggestion = max(1, int(rms * 0.7)) if not np.isnan(rms) and rms > 0 else 5
    
    if rms < 1 and not np.isnan(rms):
        print("\n⚠️ WARNUNG: Das Mikrofon scheint fast stumm zu sein!")
        suggestion = 1
    
    print(f"\n💡 Empfohlener Grenzwert: {suggestion}")
    user_val = input(f"👉 Drücken Sie [ENTER] für '{suggestion}' oder geben Sie einen Wert ein: ")

    if user_val.strip().isdigit():
        return int(user_val)
    
    print(f"Übernehme {suggestion}...")
    return suggestion

def main():
    print("�️ AlpenCode - Swiss Voice Dictation")
    print("="*40)
    
    config = load_config()
    save_folder = config['save_folder']
    
    setup_folders(save_folder)
    
    has_saved_config = config.get('device_index') is not None or config.get('silence_threshold') is not None
    if has_saved_config:
        print("\n💾 GESPEICHERTE KONFIGURATION GEFUNDEN:")
        if config.get('device_index') is not None:
            print(f"   Mikrofon-Gerät: {config['device_index']}")
        if config.get('silence_threshold') is not None:
            print(f"   Stille-Schwelle: {config['silence_threshold']}")
        use_saved = input("\n👉 Gespeicherte Konfiguration verwenden? (j/n): ")
        if use_saved.lower() not in ['j', 'y', 'yes', 'ja', '']:
            print("🔄 Konfiguration wird neu eingestellt...")
            config['device_index'] = None
            config['silence_threshold'] = None
            save_config(config)
    
    device_index = select_audio_device(config)
    if device_index is None:
        print("❌ Kein Gerät ausgewählt. Abbruch.")
        return
    
    print("\n--- INIT ---")
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    print(f"Lade KI auf {device}... (Bitte warten)")
    
    pipe = pipeline(
        "automatic-speech-recognition", 
        model=config['model_id'], 
        device=device,
        chunk_length_s=30
    )
    
    p = pyaudio.PyAudio()
    
    if config.get('silence_threshold'):
        silence_threshold = config['silence_threshold']
    else:
        silence_threshold = calibrate_microphone(p, device_index)
        save = input("💾 Diese Schwelle speichern? (j/n): ")
        if save.lower() in ['j', 'y', 'yes', 'ja']:
            config['silence_threshold'] = silence_threshold
            save_config(config)
    
    hotkey_info = "F12"
    print("\n" + "-"*40)
    print(f"🏔️ ALPENCODE BEREIT! (Schwelle: {silence_threshold})")
    print(f"   Halten Sie {hotkey_info} gedrückt zum Diktieren.")
    print(f"   Aufnahmen: {save_folder}")
    print("-"*40)
    
    send_notification("AlpenCode", f"Bereit! Schwelle: {silence_threshold}")
    
    frames = []
    recording_state = False # True wenn Taste gedrückt
    stream = None
    
    warmup_frames = int(RATE / CHUNK * 0.2)  # 200ms
    warmup_counter = 0

    def on_press(key):
        nonlocal recording_state
        if key == keyboard.Key.f12 and not recording_state:
            recording_state = True

    def on_release(key):
        nonlocal recording_state
        if key == keyboard.Key.f12 and recording_state:
            recording_state = False

    listener = keyboard.Listener(on_press=on_press, on_release=on_release)
    listener.start()

    while True:
        # State Machine im Main Thread
        if recording_state and stream is None:
            # Start Recording
            mute_system()
            send_notification("🎙️", "Aufnahme...")
            frames = []
            warmup_counter = 0
            try:
                stream = p.open(format=pyaudio.paInt16, 
                                channels=1, 
                                rate=RATE, 
                                input=True, 
                                input_device_index=device_index,
                                frames_per_buffer=CHUNK)
            except Exception as e:
                print(f"Fehler beim Öffnen des Streams: {e}")
                recording_state = False
                unmute_system()
        
        elif not recording_state and stream is not None:
            # Stop Recording
            send_notification("⏳", "Prüfe...")
            try:
                stream.stop_stream()
                stream.close()
            except:
                pass
            stream = None
            unmute_system()
            
            # Process Audio (unten weiter)
        
        if stream:
            try:
                data = stream.read(CHUNK, exception_on_overflow=False)
                warmup_counter += 1
                if warmup_counter > warmup_frames:
                    frames.append(data)
            except: pass
        
        elif len(frames) > 0:
            raw_data = b''.join(frames)
            audio_data = np.frombuffer(raw_data, dtype=np.int16)
            
            if len(audio_data) == 0:
                frames = []
                continue
            
            audio_duration = len(audio_data) / RATE
            
            if audio_duration < 0.5:
                print(f"--> Ignoriert (zu kurz: {audio_duration:.2f}s)")
                frames = []
                continue
            
            rms = np.sqrt(np.mean(audio_data.astype(float)**2)) / 32768 * 100
            
            if np.isnan(rms):
                print(f"Pegel: N/A (Schwelle: {silence_threshold})")
                frames = []
                continue
            
            print(f"Pegel: {int(rms)} (Schwelle: {silence_threshold})")

            if rms < silence_threshold:
                print(f"--> Ignoriert (zu leise)")
                frames = []
                continue
            
            timestamp = datetime.datetime.now().strftime("%H-%M-%S")
            filename = os.path.join(save_folder, f"rec_{timestamp}.wav")
            wavfile.write(filename, RATE, audio_data)
            frames = []

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
                    print("--> Halluzination blockiert.")
                    continue

                replacements = {
                    "PrideProject": "pyproject",
                    "MaxProject": "pyproject",
                    "Rimini": "README",
                    "Depensys": "Dependencies",
                }
                for wrong, right in replacements.items():
                    text = text.replace(wrong, right)

                if text and len(text) > 1:
                    print(f"Text: {text}")
                    type_text_via_clipboard(text)
                    time.sleep(0.1)
                    pyautogui.press('enter')

            except Exception as e:
                print(f"Fehler: {e}")

        else:
            time.sleep(0.05)

if __name__ == "__main__":
    main()
