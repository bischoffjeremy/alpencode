
**Swiss German Voice-to-Code Dictation** powered by Whisper AI

# 🏔️ AlpenCode

![AlpenCode Logo](cow.jpg)

**Swiss German Voice-to-Code** powered by Whisper AI

AlpenCode ist eine VS Code Extension, die Schweizerdeutsch direkt in Code oder Text umwandelt. Ideal für Programmierer: Hände frei, Dialekt sprechen, Code erhalten.

-----

## ✨ Features

  * 🎤 **High-End Erkennung**
    Nutzt das Modell `whisper-large-v3-turbo-swiss-german` für präzise Ergebnisse.
  * 🖥️ **Cross-Platform**
    Läuft nativ auf Windows, macOS & Linux.
  * ⚡ **Performance**
    Unterstützt NVIDIA GPU (CUDA) Beschleunigung für Echtzeit-Transkription.
  * 🧹 **Sauberes System**
    Audio-Aufnahmen landen im temporären Systemordner und belegen keinen dauerhaften Speicherplatz.
  * ⌨️ **Push-to-Talk**
    Einfach `F12` gedrückt halten zum Diktieren.

-----

## 🚀 Installation

1.  Installieren Sie die Extension über den VS Code Marketplace.
2.  Beim ersten Auslösen eines Befehls (z.B. durch Drücken von F12) installiert AlpenCode automatisch die benötigte Python-Umgebung und lädt die KI-Modelle (\~2GB).

-----

## 📋 Voraussetzungen

  * **Python 3.9+**: Muss auf dem System installiert sein.
  * **Mikrofon**: Ein funktionierendes Eingabegerät.
  * **GPU (Optional)**: Für maximale Geschwindigkeit eine NVIDIA Grafikkarte mit installierten Treibern (CUDA 11.8+ empfohlen). Ohne GPU läuft das Modell auf der CPU (langsamer, aber voll funktionstüchtig).

-----

## 🎯 Verwendung

1.  Öffnen Sie eine Datei in VS Code.
2.  Halten Sie **`F12`** gedrückt (Push-to-Talk Modus).
3.  Sprechen Sie deutlich auf **Schweizerdeutsch**.
4.  Lassen Sie die Taste los – der Text wird transkribiert und an der Cursor-Position eingefügt.

> **Tipp:** Beim ersten Start werden Sie aufgefordert, das richtige Mikrofon aus einer Liste auszuwählen.

-----

## 📂 Speicherorte & Konfiguration

AlpenCode trennt strikt zwischen permanenten Einstellungen und temporären Daten, um Ihr System sauber zu halten.

### 1\. Permanente Einstellungen (Config)

Hier werden Mikrofon-Auswahl und Modell-Einstellungen gespeichert.

  * **Windows:** `%APPDATA%\AlpenCode`
  * **Mac / Linux:** `~/.config/alpencode`

### 2\. Temporäre Daten (Audio Cache)

Hier landen die kurzzeitigen Audio-Aufnahmen. Diese werden vom Betriebssystem oder bei der Deinstallation automatisch bereinigt.

  * **Pfad:** System Temp Ordner (`/tmp` oder `%TEMP%`)

-----

## 🛠️ Reset & Deinstallation

Falls Probleme auftreten oder Sie Platz schaffen möchten, können Sie die Installation zurücksetzen.
Öffnen Sie dazu die Command Palette in VS Code (`Ctrl+Shift+P`) und suchen Sie nach:

`AlpenCode: Reset Installation`

Dies löscht:

  * Das virtuelle Python-Environment (`venv`)
  * Die heruntergeladenen KI-Modelle (HuggingFace Cache)
  * Den temporären Aufnahme-Ordner

-----

## 🙏 Credits

Ein herzliches Dankeschön an **Flurin17** für das Training und die Bereitstellung des spezialisierten Modells:

🔗 [Flurin17/whisper-large-v3-turbo-swiss-german](https://huggingface.co/Flurin17/whisper-large-v3-turbo-swiss-german)