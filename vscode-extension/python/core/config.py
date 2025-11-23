import json
import os
import platform
from pathlib import Path
import sys

class ConfigManager:
    # HIER WAREN DIE WERTE FEHLEND!
    DEFAULT_CONFIG = {
        "device_index": 0,
        "save_folder": str(Path.home() / "AlpenCode_Recordings"),
        "model_id": "Flurin17/whisper-large-v3-turbo-swiss-german",
        "silence_threshold": 5,
        "streaming_active": False,      # Live-Streaming
        "auto_enter_active": True,     # Auto Enter
        "stream_pause": 650,            # ms zwischen Wörtern
        "auto_stop_delay": 15.0          # s bis Auto-Stop
    }   

    @staticmethod
    def get_config_dir():
        if platform.system() == "Windows":
            return Path(os.environ.get('APPDATA', Path.home())) / "AlpenCode"
        else:
            return Path.home() / ".config" / "alpencode"

    def load(self):
        config_dir = self.get_config_dir()
        config_file = config_dir / "config.json"
        
        if config_file.exists():
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    merged = self.DEFAULT_CONFIG.copy()
                    merged.update(data)
                    return merged
            except Exception as e:
                print(json.dumps({"type": "error", "message": f"Config Load Error: {e}"}))
                return self.DEFAULT_CONFIG.copy()
        
        self.save(self.DEFAULT_CONFIG)
        return self.DEFAULT_CONFIG.copy()

    def save(self, new_config):
        config_dir = self.get_config_dir()
        config_dir.mkdir(parents=True, exist_ok=True)
        config_file = config_dir / "config.json"
        
        try:
            current_data = {}
            if config_file.exists():
                try:
                    with open(config_file, 'r', encoding='utf-8') as f:
                        current_data = json.load(f)
                except: pass
            
            current_data.update(new_config)
            
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(current_data, f, indent=2)
        except Exception as e:
            print(json.dumps({"type": "error", "message": f"Config Save Error: {e}"}))