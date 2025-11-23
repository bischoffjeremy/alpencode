import sys
import json
import os
import time
import threading
import queue
from core.config import ConfigManager
from core.audio import AudioEngine
from core.system import SystemController
from core.transcriber import SwissTranscriber

worker_running = False

def send_json(data):
    print(json.dumps(data))
    sys.stdout.flush()

def transcription_worker(audio_queue, transcriber, temp_file, silence_thresh, sys_ctrl, config_mgr):
    global worker_running
    worker_running = True
    
    while worker_running:
        try:
            item = audio_queue.get(timeout=0.5)
            
            # 1. TRANSCRIPTION
            if isinstance(item, bytes) and len(item) > 0:
                try:
                    text = transcriber.transcribe(item, temp_file, silence_thresh)
                    if text and len(text) > 0:
                        sys_ctrl.write(text + " ") 
                except Exception as e:
                    send_json({"type": "status", "message": f"Transcribe Error: {e}"})

            # 2. STOP COMMAND
            elif item == "CMD_STOP":
                conf = config_mgr.load()
                auto_enter = bool(conf.get('auto_enter_active', False))
                
                print(json.dumps({"type": "status", "message": f"⏹ Processing Stop. Auto-Enter: {auto_enter}"}), flush=True)

                if auto_enter:
                    sys_ctrl.press_enter()
                    print(json.dumps({"type": "status", "message": "✅ ENTER PRESSED"}), flush=True)
                
                sys_ctrl.unmute()
                send_json({"type": "ready", "message": "Done"})

            audio_queue.task_done()
            
        except queue.Empty:
            continue
        except Exception as e:
            send_json({"type": "error", "message": f"Worker Error: {e}"})

def main():
    global worker_running
    send_json({"type": "status", "message": "Initializing..."})
    
    config_mgr = ConfigManager()
    config = config_mgr.load()
    
    if not os.path.exists(config['save_folder']):
        os.makedirs(config['save_folder'])
    
    sys_ctrl = SystemController()
    audio = AudioEngine()
    
    send_json({"type": "status", "message": f"Loading AI ({config['model_id']})..."})
    
    try:
        transcriber = SwissTranscriber(config['model_id'])
        send_json({"type": "ready", "message": "Ready"})
    except Exception as e:
        send_json({"type": "error", "message": f"AI Error: {e}"})
        return

    TEMP_FILE = os.path.join(config['save_folder'], "tmp.wav")
    worker_thread = None

    while True:
        try:
            line = sys.stdin.readline()
            if not line: break
            
            cmd_parts = line.strip().split(" ", 1)
            cmd = cmd_parts[0]
            arg = cmd_parts[1] if len(cmd_parts) > 1 else None

            if cmd == "start":
                if audio.monitoring: audio.stop_monitoring(); time.sleep(0.2)
                sys_ctrl.mute()
                
                c = config_mgr.load()
                
                audio.start_recording(
                    c['device_index'], 
                    c['silence_threshold'],
                    streaming=bool(c.get('streaming_active', False)),
                    stream_pause_ms=int(c.get('stream_pause', 500)),
                    stop_pause_s=float(c.get('auto_stop_delay', 3.0))
                )
                
                if worker_thread is None or not worker_thread.is_alive():
                    worker_running = True
                    worker_thread = threading.Thread(
                        target=transcription_worker,
                        args=(audio.get_queue(), transcriber, TEMP_FILE, c['silence_threshold'], sys_ctrl, config_mgr),
                        daemon=True
                    )
                    worker_thread.start()
                
                send_json({"type": "status", "message": "Recording..."})
            
            elif cmd == "stop":
                audio.stop_recording()
                audio.get_queue().put("CMD_STOP")
                send_json({"type": "status", "message": "Stopping..."})
            
            # --- CONFIG HANDLER ---
            elif cmd == "set_config_val":
                try:
                    parts = arg.strip().split(" ", 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        raw_val = parts[1].strip()
                        
                        val = raw_val # Fallback
                        
                        # Saubere Typ-Konvertierung für JSON
                        if key in ['auto_enter_active', 'streaming_active']:
                            val = (raw_val.lower() == "true") # -> True/False (bool)
                        elif key in ['device_index', 'stream_pause']:
                            val = int(float(raw_val)) # -> Int
                        elif key in ['silence_threshold', 'auto_stop_delay']:
                            val = float(raw_val) # -> Float
                        
                        config = config_mgr.load()
                        config[key] = val
                        config_mgr.save(config)
                        
                        # Feedback an UI
                        print(json.dumps({"type": "status", "message": f"💾 Saved: {key}={val}"}))
                        sys.stdout.flush()

                        # Live-Update für Monitor wenn nötig
                        if key == 'device_index' and audio.monitoring:
                            audio.stop_monitoring()
                            time.sleep(0.2)
                            audio.start_monitoring(val)

                except Exception as e:
                    send_json({"type": "error", "message": f"Save Error: {e}"})

            elif cmd == "get_config":
                c = config_mgr.load()
                # Wir senden die Config explizit zurück
                send_json({
                    "type": "config_info", 
                    "threshold": c.get('silence_threshold', 1.0),
                    "device": c.get('device_index'),
                    "auto_enter_active": c.get('auto_enter_active', False),
                    "streaming_active": c.get('streaming_active', False),
                    "stream_pause": c.get('stream_pause', 500),
                    "auto_stop_delay": c.get('auto_stop_delay', 3.0)
                })

            elif cmd == "type_text" and arg:
                sys_ctrl.write(arg)

            elif cmd == "press_enter":
                sys_ctrl.press_enter()

            elif cmd == "refreshDevices" or cmd == "list_devices":
                send_json({"type": "devices", "devices": audio.list_devices()})

            elif cmd == "start_monitor":
                if not audio.recording:
                    audio.start_monitoring(config_mgr.load()['device_index'])
            
            elif cmd == "stop_monitor":
                audio.stop_monitoring()

            elif cmd == "calibrate":
                send_json({"type": "status", "message": "Calibrating..."})
                if audio.monitoring: audio.stop_monitoring(); time.sleep(0.2)
                config = config_mgr.load()
                try:
                    with audio.get_queue().mutex: audio.get_queue().queue.clear()
                    audio.start_recording(config['device_index'], 0)
                    time.sleep(3)
                    audio.stop_recording()
                    full_audio = b''
                    q = audio.get_queue()
                    time.sleep(0.2)
                    while not q.empty():
                        try: 
                            item = q.get_nowait()
                            if isinstance(item, bytes): full_audio += item
                        except: pass
                    if full_audio:
                        rms = AudioEngine.calculate_rms(full_audio)
                        sug = max(1.0, float(rms) * 1.5)
                        send_json({"type": "calibration_result", "rms": float(rms), "suggestion": sug})
                    else:
                        send_json({"type": "error", "message": "No Audio"})
                    send_json({"type": "ready", "message": "Done"})
                except Exception as e:
                    send_json({"type": "error", "message": str(e)})

            elif cmd == "quit":
                worker_running = False
                break

        except KeyboardInterrupt: break
        except Exception as e: send_json({"type": "error", "message": str(e)})

if __name__ == "__main__": main()