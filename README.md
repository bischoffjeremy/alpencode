# 🏔️ AlpenCode

![AlpenCode Logo](cow.jpg)

**Swiss German Voice-to-Code Dictation** powered by Whisper AI

AlpenCode ist ein intelligentes Diktierwerkzeug, das Schweizerdeutsch direkt in Text umwandelt – sprechen Sie einfach auf Schweizerdeutsch und der Code wird automatisch transkribiert und eingefügt. Perfekt für Programmierer, die ihre Hände frei haben möchten und natürlich in ihrem Dialekt arbeiten wollen!

## ✨ Features

- 🎤 **Schweizerdeutsch-Spracherkennung** mit Whisper Large V3 Turbo
- 🖥️ **Cross-Platform**: Windows & Linux
- 🎯 **Intelligente Mikrofon-Auswahl** beim Start
- 🔇 **Automatische Kalibrierung** für optimale Erkennung
- 🚫 **Halluzinations-Filter** gegen Wiederholungen
- ⌨️ **F12-Taste** zum Diktieren (Push-to-Talk)
- 🔊 **Automatische Lautstärke-Steuerung** während der Aufnahme

## 🙏 Credits

Dieses Projekt nutzt das exzellente Swiss German Whisper-Modell von **Flurin Maissen**:

- **Modell**: [Flurin17/whisper-large-v3-turbo-swiss-german](https://huggingface.co/Flurin17/whisper-large-v3-turbo-swiss-german)
- **HuggingFace**: [https://huggingface.co/Flurin17](https://huggingface.co/Flurin17)

Ein grosses Dankeschön an Flurin für das Training dieses Swiss German Models! 🇨🇭

## 🚀 Installation

### Voraussetzungen

- Python 3.9 oder höher
- [UV Package Manager](https://github.com/astral-sh/uv) (empfohlen)
- Mikrofon
- Für GPU-Beschleunigung: CUDA-fähige NVIDIA-Grafikkarte

### UV Installation (empfohlen)

```bash
# UV installieren (falls noch nicht vorhanden)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Projekt klonen/herunterladen und Verzeichnis wechseln
cd alpencode

# Abhängigkeiten installieren
uv sync
```

## 🎯 Verwendung

1. **Starten Sie AlpenCode:**
   ```bash
   uv run alpencode
   # oder alternativ:
   uv run ispy
   ```

2. **Mikrofon auswählen:**
   - Beim ersten Start werden alle verfügbaren Mikrofone aufgelistet
   - Geben Sie die Nummer Ihres Mikrofons ein

3. **Kalibrierung:**
   - Sprechen Sie einen Satz, wenn Sie dazu aufgefordert werden

4. **Diktieren:**
   - **Halten Sie die F12-Taste gedrückt**, um mit dem Diktieren zu beginnen (Push-to-Talk-Modus).
   - Sprechen Sie Ihren Text klar und deutlich auf Schweizerdeutsch.
   - **Lassen Sie die F12-Taste los**, um die Aufnahme zu beenden.
   - Der Text wird automatisch transkribiert, gefiltert und in das aktive Textfeld eingefügt (z.B. in einem Editor oder Browser).
   - Wiederholen Sie dies für jeden Satz – das Tool läuft im Hintergrund und wartet auf F12.

## 📋 Plattform-spezifische Hinweise

### Linux und Derivate

Für Linux-Systeme (Ubuntu, Debian, Fedora, etc.) stellen Sie sicher, dass die Audio-Abhängigkeiten installiert sind:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install portaudio19-dev python3-dev

# Fedora
sudo dnf install portaudio-devel python3-devel

# Nach der Installation von Abhängigkeiten:
uv sync
uv run alpencode
```

### Windows

Für Windows-Systeme installieren Sie die notwendigen Abhängigkeiten über den Package Manager:

```powershell
# Abhängigkeiten installieren
uv sync

# Zusätzliche Windows-spezifische Pakete (falls benötigt)
uv add win10toast

# Starten
uv run alpencode
```

## 🔧 Entwicklung

- Script direkt ausführen: `python whisper_dictation.py`
- Konfiguration: Standardwerte in `whisper_dictation.py` (RATE, CHUNK, MODEL_ID, SAVE_FOLDER)

## 📝 Hinweis

Für GPU-Beschleunigung ist eine CUDA-fähige NVIDIA GPU nötig; ansonsten läuft das Modell auf CPU (langsamer).

**Konfiguration**: Einstellungen (Mikrofon, Schwelle) werden automatisch gespeichert in:
- **Linux**: `~/.config/swiss_whisper/config.json`
- **Windows**: `%APPDATA%\SwissWhisper\config.json` (z.B. `C:\Users\DeinName\AppData\Roaming\SwissWhisper\config.json`)

Beim nächsten Start kannst du wählen, ob du die gespeicherten Einstellungen verwenden oder neu konfigurieren möchtest.
