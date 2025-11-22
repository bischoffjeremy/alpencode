# 🇨🇭 AlpenCode - Swiss German Voice-to-Code

AlpenCode is a VS Code extension that allows you to dictate code and comments in **Swiss German**. It uses a specialized AI model (`whisper-large-v3-turbo-swiss-german`) to transcribe your voice directly into your editor, terminal, or AI chat.

> **⚠️ IMPORTANT REQUIREMENT:**
> **PYTHON 3.8+ IS REQUIRED TO RUN THIS EXTENSION!**
> The extension will automatically create a virtual environment and download the necessary AI models (~2GB) upon first use. Please ensure Python is installed and added to your PATH.

## Features

- **🇨🇭 Swiss German Support**: Optimized for Swiss German dialects.
- **🎤 Universal Dictation**: Works in the editor, terminal, and AI chat inputs.
- **⚡ Fast & Local**: Runs locally on your machine (requires Python & ~2GB disk space).
- **🎛️ Settings & Calibration**: Built-in menu to select microphones and calibrate input levels.
- **⌨️ Shortcuts**: Press `Alt+S` to toggle recording instantly.

## Requirements

- **Python 3.8+** installed on your system.
- **NVIDIA GPU** recommended (but works on CPU).
- **Microphone**.

## Installation

1. Install the extension.
2. On first run, AlpenCode will automatically set up a Python virtual environment and download the necessary AI models. This may take a few minutes.
3. Once the status bar shows **"🇨🇭 AlpenCode Ready"**, you are good to go!

## Usage

1. **Start/Stop Dictation**: Press `Alt+S` or click the status bar item.
2. **Settings**: Open the Command Palette (`Ctrl+Shift+P`) and run `AlpenCode: Settings & Calibration`.
3. **Auto-Enter**: Enable `alpencode.autoEnter` in settings to automatically press Enter after dictation (useful for chat).

## Configuration

- `alpencode.pythonPath`: Path to your Python interpreter (default: `python3`).
- `alpencode.autoEnter`: Automatically press Enter after inserting text.

## Troubleshooting

- If the extension fails to start, try running `AlpenCode: Reset Environment` from the Command Palette to reinstall dependencies.
- Ensure your microphone is not being used exclusively by another application.

---
*Powered by OpenAI Whisper & Fine-tuned on Swiss German datasets.*
