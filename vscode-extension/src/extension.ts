import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ensurePythonEnvironment } from './installer';

let pythonProcess: cp.ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let isExplicitlyStopped = false;

export async function activate(context: vscode.ExtensionContext) {
    console.log('AlpenCode is now active!');

    outputChannel = vscode.window.createOutputChannel("AlpenCode");
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'alpencode.toggle';
    statusBarItem.text = "$(sync~spin) AlpenCode Init...";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Check & Install Python Environment
    const pythonPath = await ensurePythonEnvironment(context, outputChannel);
    if (pythonPath) {
        startPythonBackend(context, pythonPath);
    } else {
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
        } else {
            vscode.commands.executeCommand('alpencode.start');
        }
    });
    let settingsCommand = vscode.commands.registerCommand('alpencode.settings', () => {
        const panel = vscode.window.createWebviewPanel(
            'alpencodeSettings',
            'AlpenCode Settings',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        const htmlPath = path.join(context.extensionPath, 'media', 'settings.html');
        panel.webview.html = fs.readFileSync(htmlPath, 'utf8');

        // Send initial settings
        const config = vscode.workspace.getConfiguration('alpencode');
        panel.webview.postMessage({ 
            type: 'init_settings', 
            autoEnter: config.get<boolean>('autoEnter', false) 
        });

        // Handle messages from WebView
        panel.webview.onDidReceiveMessage(message => {
            if (message.command === 'toggle_auto_enter') {
                const config = vscode.workspace.getConfiguration('alpencode');
                config.update('autoEnter', message.value, vscode.ConfigurationTarget.Global);
            } else if (message.command === 'reset_env') {
                vscode.commands.executeCommand('alpencode.resetEnv');
            } else if (pythonProcess && pythonProcess.stdin) {
                if (message.command === 'list_devices') {
                    pythonProcess.stdin.write('list_devices\n');
                } else if (message.command === 'set_device') {
                    pythonProcess.stdin.write(`set_device ${message.index}\n`);
                } else if (message.command === 'calibrate') {
                    pythonProcess.stdin.write('calibrate\n');
                } else if (message.command === 'start_monitor') {
                    pythonProcess.stdin.write('start_monitor\n');
                } else if (message.command === 'stop_monitor') {
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

    let resetEnvCommand = vscode.commands.registerCommand('alpencode.resetEnv', async () => {
        const choice = await vscode.window.showWarningMessage(
            "Are you sure you want to delete the AlpenCode Python environment? It will be re-installed next time.",
            "Yes, Delete", "Cancel"
        );
        
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
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to delete environment: ${e}`);
            }
        }
    });

    context.subscriptions.push(settingsCommand);
    context.subscriptions.push(resetEnvCommand);
}

let currentSettingsPanel: vscode.WebviewPanel | undefined;

function startPythonBackend(context: vscode.ExtensionContext, pythonPath: string) {
    isExplicitlyStopped = false;
    const scriptPath = path.join(context.extensionPath, 'python', 'backend.py');

    outputChannel.appendLine(`Starting Python backend: ${pythonPath} ${scriptPath}`);

    // Environment variables für Python (wichtig für Imports)
    const env = { ...process.env };
    
    env['PYTHONUNBUFFERED'] = '1';

    pythonProcess = cp.spawn(pythonPath, [scriptPath], { env });

    if (pythonProcess.stdout) {
        pythonProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    handleBackendMessage(msg);
                } catch (e) {
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

function handleBackendMessage(msg: any) {
    if (msg.type === 'status') {
        outputChannel.appendLine(`Status: ${msg.message}`);
    } else if (msg.type === 'ready') {
        outputChannel.appendLine(`Status: ${msg.message}`);
        statusBarItem.text = "🇨🇭 AlpenCode Ready";
        statusBarItem.show();
    } else if (msg.type === 'transcription') {
        insertText(msg.text);
    } else if (msg.type === 'error') {
        vscode.window.showErrorMessage(`AlpenCode Error: ${msg.message}`);
    } else if (msg.type === 'level') {
    } else if (msg.type === 'devices') {
        if (currentSettingsPanel) {
            currentSettingsPanel.webview.postMessage({ type: 'devices', devices: msg.devices });
        }
    } else if (msg.type === 'calibration_result') {
        if (currentSettingsPanel) {
            currentSettingsPanel.webview.postMessage({ 
                type: 'calibration_result', 
                rms: msg.rms, 
                suggestion: msg.suggestion 
            });
        }
        showCalibrationResult(msg);
    } else if (msg.type === 'calibration_level') {
        if (currentSettingsPanel) {
            currentSettingsPanel.webview.postMessage({ type: 'calibration_level', value: msg.value });
        }
    }
}

async function showCalibrationResult(msg: any) {
    const choice = await vscode.window.showInputBox({
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
}

function insertText(text: string) {
    // Use the 'type' command to insert text into the focused element (editor, input box, etc.)
    const config = vscode.workspace.getConfiguration('alpencode');
    const autoEnter = config.get<boolean>('autoEnter', false);
    
    outputChannel.appendLine(`Inserting text: "${text}" (AutoEnter: ${autoEnter})`);

    if (autoEnter) {
        // Insert text first
        vscode.commands.executeCommand('type', { text: text });
        
        // Use backend to simulate real Enter key press (works in Chat windows)
        if (pythonProcess && pythonProcess.stdin) {
            pythonProcess.stdin.write('press_enter\n');
        } else {
            // Fallback if backend not ready
            vscode.commands.executeCommand('type', { text: "\n" });
        }
    } else {
        vscode.commands.executeCommand('type', { text: text + " " });
    }
}

function updateStatusBar(recording: boolean) {
    if (recording) {
        statusBarItem.text = "$(record) Recording...";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else {
        statusBarItem.text = "🇨🇭 AlpenCode Ready";
        statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
}

export function deactivate() {
    if (pythonProcess) {
        isExplicitlyStopped = true;
        pythonProcess.kill();
    }
}
