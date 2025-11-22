"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const installer_1 = require("./installer");
let pythonProcess;
let statusBarItem;
let outputChannel;
let isExplicitlyStopped = false;
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('AlpenCode is now active!');
        outputChannel = vscode.window.createOutputChannel("AlpenCode");
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'alpencode.toggle';
        statusBarItem.text = "$(sync~spin) AlpenCode Init...";
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
        // Check & Install Python Environment
        const pythonPath = yield (0, installer_1.ensurePythonEnvironment)(context, outputChannel);
        if (pythonPath) {
            startPythonBackend(context, pythonPath);
        }
        else {
            statusBarItem.text = "$(error) AlpenCode Setup Failed";
            statusBarItem.show();
        }
        let startCommand = vscode.commands.registerCommand('alpencode.start', () => {
            if (pythonProcess && pythonProcess.stdin) {
                pythonProcess.stdin.write('start\n');
                updateStatusBar(true);
            }
        });
        let stopCommand = vscode.commands.registerCommand('alpencode.stop', () => {
            if (pythonProcess && pythonProcess.stdin) {
                pythonProcess.stdin.write('stop\n');
                updateStatusBar(false);
            }
        });
        let toggleCommand = vscode.commands.registerCommand('alpencode.toggle', () => {
            if (statusBarItem.text.includes("Recording")) {
                vscode.commands.executeCommand('alpencode.stop');
            }
            else {
                vscode.commands.executeCommand('alpencode.start');
            }
        });
        let settingsCommand = vscode.commands.registerCommand('alpencode.settings', () => {
            const panel = vscode.window.createWebviewPanel('alpencodeSettings', 'AlpenCode Settings', vscode.ViewColumn.One, { enableScripts: true });
            const htmlPath = path.join(context.extensionPath, 'media', 'settings.html');
            panel.webview.html = fs.readFileSync(htmlPath, 'utf8');
            // Send initial settings
            const config = vscode.workspace.getConfiguration('alpencode');
            panel.webview.postMessage({
                type: 'init_settings',
                autoEnter: config.get('autoEnter', false)
            });
            // Handle messages from WebView
            panel.webview.onDidReceiveMessage(message => {
                if (message.command === 'toggle_auto_enter') {
                    const config = vscode.workspace.getConfiguration('alpencode');
                    config.update('autoEnter', message.value, vscode.ConfigurationTarget.Global);
                }
                else if (message.command === 'reset_env') {
                    vscode.commands.executeCommand('alpencode.resetEnv');
                }
                else if (pythonProcess && pythonProcess.stdin) {
                    if (message.command === 'list_devices') {
                        pythonProcess.stdin.write('list_devices\n');
                    }
                    else if (message.command === 'set_device') {
                        pythonProcess.stdin.write(`set_device ${message.index}\n`);
                    }
                    else if (message.command === 'calibrate') {
                        pythonProcess.stdin.write('calibrate\n');
                    }
                    else if (message.command === 'start_monitor') {
                        pythonProcess.stdin.write('start_monitor\n');
                    }
                    else if (message.command === 'stop_monitor') {
                        pythonProcess.stdin.write('stop_monitor\n');
                    }
                }
            });
            // Forward backend messages to WebView
            const interval = setInterval(() => {
            }, 1000);
            panel.onDidDispose(() => {
                clearInterval(interval);
                if (pythonProcess && pythonProcess.stdin) {
                    pythonProcess.stdin.write('stop_monitor\n');
                }
                currentSettingsPanel = undefined;
            });
            // Store panel reference to send messages later
            currentSettingsPanel = panel;
        });
        let resetEnvCommand = vscode.commands.registerCommand('alpencode.resetEnv', () => __awaiter(this, void 0, void 0, function* () {
            const choice = yield vscode.window.showWarningMessage("Are you sure you want to delete the AlpenCode Python environment? It will be re-installed next time.", "Yes, Delete", "Cancel");
            if (choice === "Yes, Delete") {
                if (pythonProcess) {
                    isExplicitlyStopped = true;
                    pythonProcess.kill();
                    pythonProcess = undefined;
                    updateStatusBar(false);
                }
                const venvPath = path.join(context.extensionPath, 'venv');
                try {
                    fs.rmSync(venvPath, { recursive: true, force: true });
                    vscode.window.showInformationMessage("Environment deleted. Please reload window to reinstall.");
                }
                catch (e) {
                    vscode.window.showErrorMessage(`Failed to delete environment: ${e}`);
                }
            }
        }));
        context.subscriptions.push(settingsCommand);
        context.subscriptions.push(resetEnvCommand);
    });
}
let currentSettingsPanel;
function startPythonBackend(context, pythonPath) {
    isExplicitlyStopped = false;
    const scriptPath = path.join(context.extensionPath, 'python', 'backend.py');
    outputChannel.appendLine(`Starting Python backend: ${pythonPath} ${scriptPath}`);
    // Environment variables für Python (wichtig für Imports)
    const env = Object.assign({}, process.env);
    env['PYTHONUNBUFFERED'] = '1';
    pythonProcess = cp.spawn(pythonPath, [scriptPath], { env });
    if (pythonProcess.stdout) {
        pythonProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const msg = JSON.parse(line);
                    handleBackendMessage(msg);
                }
                catch (e) {
                    outputChannel.appendLine(`Raw output: ${line}`);
                }
            }
        });
    }
    if (pythonProcess.stderr) {
        pythonProcess.stderr.on('data', (data) => {
            outputChannel.appendLine(`Error: ${data}`);
        });
    }
    pythonProcess.on('close', (code) => {
        outputChannel.appendLine(`Python backend exited with code ${code}`);
        statusBarItem.text = "$(error) AlpenCode Stopped";
        statusBarItem.show();
        if (!isExplicitlyStopped) {
            vscode.window.showErrorMessage(`AlpenCode Backend crashed (Code ${code}).`, "Restart AlpenCode").then(selection => {
                if (selection === "Restart AlpenCode") {
                    startPythonBackend(context, pythonPath);
                }
            });
        }
    });
}
function handleBackendMessage(msg) {
    if (msg.type === 'status') {
        outputChannel.appendLine(`Status: ${msg.message}`);
    }
    else if (msg.type === 'ready') {
        outputChannel.appendLine(`Status: ${msg.message}`);
        statusBarItem.text = "🇨🇭 AlpenCode Ready";
        statusBarItem.show();
    }
    else if (msg.type === 'transcription') {
        insertText(msg.text);
    }
    else if (msg.type === 'error') {
        vscode.window.showErrorMessage(`AlpenCode Error: ${msg.message}`);
    }
    else if (msg.type === 'level') {
    }
    else if (msg.type === 'devices') {
        if (currentSettingsPanel) {
            currentSettingsPanel.webview.postMessage({ type: 'devices', devices: msg.devices });
        }
    }
    else if (msg.type === 'calibration_result') {
        if (currentSettingsPanel) {
            currentSettingsPanel.webview.postMessage({
                type: 'calibration_result',
                rms: msg.rms,
                suggestion: msg.suggestion
            });
        }
        showCalibrationResult(msg);
    }
    else if (msg.type === 'calibration_level') {
        if (currentSettingsPanel) {
            currentSettingsPanel.webview.postMessage({ type: 'calibration_level', value: msg.value });
        }
    }
}
function showCalibrationResult(msg) {
    return __awaiter(this, void 0, void 0, function* () {
        const choice = yield vscode.window.showInputBox({
            title: "Microphone Calibration",
            prompt: `Measured Level: ${msg.rms}. Suggested Threshold: ${msg.suggestion}`,
            value: msg.suggestion.toString(),
            validateInput: (value) => {
                return isNaN(Number(value)) ? "Please enter a number" : null;
            }
        });
        if (choice && pythonProcess && pythonProcess.stdin) {
            pythonProcess.stdin.write(`set_threshold ${choice}\n`);
            vscode.window.showInformationMessage(`Threshold set to ${choice}`);
        }
    });
}
function insertText(text) {
    // Use the 'type' command to insert text into the focused element (editor, input box, etc.)
    const config = vscode.workspace.getConfiguration('alpencode');
    const autoEnter = config.get('autoEnter', false);
    outputChannel.appendLine(`Inserting text: "${text}" (AutoEnter: ${autoEnter})`);
    if (autoEnter) {
        // Insert text first
        vscode.commands.executeCommand('type', { text: text });
        // Use backend to simulate real Enter key press (works in Chat windows)
        if (pythonProcess && pythonProcess.stdin) {
            pythonProcess.stdin.write('press_enter\n');
        }
        else {
            // Fallback if backend not ready
            vscode.commands.executeCommand('type', { text: "\n" });
        }
    }
    else {
        vscode.commands.executeCommand('type', { text: text + " " });
    }
}
function updateStatusBar(recording) {
    if (recording) {
        statusBarItem.text = "$(record) Recording...";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    else {
        statusBarItem.text = "🇨🇭 AlpenCode Ready";
        statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
}
function deactivate() {
    if (pythonProcess) {
        isExplicitlyStopped = true;
        pythonProcess.kill();
    }
}
//# sourceMappingURL=extension.js.map