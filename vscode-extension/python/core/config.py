import json
import os
import platform
import tempfile
from pathlib import Path
import sys

class ConfigManager:
    # 1. Temporäres Verzeichnis für Aufnahmen (wird bei Deinstall gelöscht)
    TEMP_DIR = Path(tempfile.gettempdir())
    
    DEFAULT_CONFIG = {
        "device_index": 0,
        # Standard: Aufnahmen im Temp-Ordner speichern
        "save_folder": str(TEMP_DIR / "AlpenCode_Recordings"),
        "model_id": "Flurin17/whisper-large-v3-turbo-swiss-german",
        "silence_threshold": 5,
        "streaming_active": False,      
        "auto_enter_active": True,      
        "stream_pause": 650,            
        "auto_stop_delay": 15.0         
    }    

    @staticmethod
    def get_config_dir():
        # 2. Permanenter Config-Ordner (wird bei Deinstall AUCH gelöscht)
        # Windows: %APPDATA%\AlpenCode
        # Mac/Linux: ~/.config/alpencode
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
                    return data
            except Exception as e:
                print(json.dumps({"type": "error", "message": f"Config Load Error: {e}"}))
                return self.DEFAULT_CONFIG.copy()
        
        return self.DEFAULT_CONFIG.copy()

    def save(self, new_config):
        config_dir = self.get_config_dir()
        config_dir.mkdir(parents=True, exist_ok=True)
        config_file = config_dir / "config.json"
        
        save_folder = Path(new_config.get("save_folder", self.DEFAULT_CONFIG["save_folder"]))
        try:
            if not save_folder.exists():
                save_folder.mkdir(parents=True, exist_ok=True)
        except:
            pass 

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