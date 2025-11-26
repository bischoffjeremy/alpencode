import platform
import subprocess
import re
import json
try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except ImportError:
    PYAUTOGUI_AVAILABLE = False

class SystemController:
    def __init__(self):
        self.original_volume = None
        self.os_name = platform.system()

    def press_enter(self):
        if PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.press('enter')
            except Exception as e:
                pass
        else:
            print(json.dumps({"type": "error", "message": "pyautogui missing."}))

    def mute(self):
        try:
            if self.original_volume is None:
                self.original_volume = self._get_volume()
                if self.original_volume is None:
                    self.original_volume = 50
            self._set_volume(0)
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Mute Error: {e}"}))

    def unmute(self):
        try:
            if self.original_volume is not None:
                self._set_volume(self.original_volume)
                self.original_volume = None
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Unmute Error: {e}"}))

    def _get_volume(self):
        try:
            if self.os_name == "Linux":
                # Versuche zuerst amixer
                result = subprocess.run(['amixer', 'get', 'Master'], capture_output=True, text=True)
                if result.returncode == 0:
                    match = re.search(r'\[(\d+)%\]', result.stdout)
                    if match: return int(match.group(1))
                
                # Fallback zu pactl
                result = subprocess.run(['pactl', 'get-sink-volume', '@DEFAULT_SINK@'], 
                                      capture_output=True, text=True)
                if result.returncode == 0:
                    match = re.search(r'/  (\d+)%', result.stdout)
                    if match: return int(match.group(1))

            elif self.os_name == "Windows":
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

    def _set_volume(self, volume_percent):
        try:
            if self.os_name == "Linux":
                # Versuche zuerst amixer (ALSA)
                result = subprocess.run(['amixer', 'set', 'Master', f'{volume_percent}%'], capture_output=True)
                if result.returncode == 0: return
                
                # Fallback zu pactl
                subprocess.run(['pactl', 'set-sink-volume', '@DEFAULT_SINK@', f'{volume_percent}%'], 
                             capture_output=True)

            elif self.os_name == "Windows":
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

    def write(self, text):
        """Simuliert Tastaturanschläge (funktioniert überall: Chat, Terminal, Browser)"""
        if PYAUTOGUI_AVAILABLE:
            try:
                pyautogui.write(text, interval=0.005)
            except Exception as e:
                print(json.dumps({"type": "error", "message": f"Typing Error: {e}"}))
        else:
            print(json.dumps({"type": "error", "message": "pyautogui missing."}))