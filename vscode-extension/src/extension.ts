import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ensurePythonEnvironment, resetInstallation, uninstallAlpenCode } from './installer';
import { PythonBackendManager } from './manager';
import { StatusBarManager } from './ui/statusBar';
import { SettingsPanel } from './ui/settingsPanel'; // WICHTIG!

let backend: PythonBackendManager;
let statusBar: StatusBarManager;
let outputChannel: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext | undefined;

export async function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    outputChannel = vscode.window.createOutputChannel("AlpenCode");
    statusBar = new StatusBarManager();

    // Backend Init
    backend = new PythonBackendManager(outputChannel, handleBackendMessage);

    // Environment Check
    const pythonPath = await ensurePythonEnvironment(context, outputChannel);
    if (pythonPath) {
        backend.start(pythonPath, context.extensionPath);
    } else {
        statusBar.setError("Setup Failed");
    }

    registerCommands(context);
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('alpencode.start', () => {
            backend.send('start');
            statusBar.setRecording();
        }),

        vscode.commands.registerCommand('alpencode.stop', () => {
            backend.send('stop');
            statusBar.setProcessing();
        }),

        vscode.commands.registerCommand('alpencode.toggle', () => {
            if (statusBar.text.includes("Recording")) {
                vscode.commands.executeCommand('alpencode.stop');
            } else {
                vscode.commands.executeCommand('alpencode.start');
            }
        }),

        // HIER WAR DEIN FEHLER VERMUTLICH:
        vscode.commands.registerCommand('alpencode.settings', () => {
            SettingsPanel.createOrShow(context.extensionPath, backend);
        }),

        vscode.commands.registerCommand('alpencode.calibrate', () => {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "🎤 Calibrating... Please stay silent.",
                cancellable: false
            }, async (progress) => {
                backend.send('calibrate');
                await new Promise(resolve => setTimeout(resolve, 4000));
            });
        }),

        vscode.commands.registerCommand('alpencode.resetEnv', async () => {
            const choice = await vscode.window.showWarningMessage(
                "Delete AlpenCode Python environment? It will reinstall next time.",
                "Yes, Delete", "Cancel"
            );

            if (choice === "Yes, Delete") {
                if (backend.isRunning()) {
                    backend.stop();
                    statusBar.setReady();
                }
                try {
                    const uninstalled = await uninstallAlpenCode(context, outputChannel);
                    if (uninstalled) {
                        outputChannel.appendLine('Uninstalled environment; now reinstalling...');
                        const pythonPath = await ensurePythonEnvironment(context, outputChannel);
                        if (pythonPath) {
                            backend.start(pythonPath, context.extensionPath);
                        }
                        const reload = await vscode.window.showInformationMessage('Deleted. Reload window?', 'Reload');
                        if (reload === 'Reload') vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                } catch (e) {
                    vscode.window.showErrorMessage(`Error: ${e}`);
                }
            }
        })
        ,
        vscode.commands.registerCommand('alpencode.resetInstall', async () => {
            // Reset = Uninstall + Install
            if (backend.isRunning()) {
                backend.stop();
                statusBar.setReady();
            }
            const confirm = await vscode.window.showWarningMessage(
                'Reset installation? This will remove venv, models, settings & recordings and reinstall everything.',
                'Reset', 'Cancel'
            );
            if (confirm !== 'Reset') return;
            try {
                const uninstalled = await uninstallAlpenCode(context, outputChannel);
                if (!uninstalled) {
                    vscode.window.showErrorMessage('Reset cancelled or uninstall failed.');
                    return;
                }
                outputChannel.appendLine('Uninstall successful, starting reinstall...');
                const pythonPath = await ensurePythonEnvironment(context, outputChannel);
                if (pythonPath) {
                    backend.start(pythonPath, context.extensionPath);
                    const reload = await vscode.window.showInformationMessage('AlpenCode reinstalled successfully. Reload window?', 'Reload');
                    if (reload === 'Reload') vscode.commands.executeCommand('workbench.action.reloadWindow');
                } else {
                    vscode.window.showErrorMessage('Re-installation failed. See output for details.');
                }
            } catch (e) {
                vscode.window.showErrorMessage(`Reset failed: ${e}`);
            }
        })
        ,
        vscode.commands.registerCommand('alpencode.uninstall', async () => {
            if (backend.isRunning()) {
                backend.stop();
                statusBar.setReady();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            try {
                const res = await uninstallAlpenCode(context, outputChannel);
                if (res) {
                    const reload = await vscode.window.showInformationMessage('AlpenCode Uninstall complete. Reload window?', 'Reload');
                    if (reload === 'Reload') vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } catch (e) {
                vscode.window.showErrorMessage(`Uninstall failed: ${e}`);
            }
        })
    );
}

function handleBackendMessage(msg: any) {
    // Debugging (optional)
    if (msg.type !== 'calibration_level') {
        // outputChannel.appendLine(`Msg: ${JSON.stringify(msg)}`);
    }

    switch (msg.type) {
        case 'ready':
            statusBar.setReady();
            outputChannel.appendLine("Backend ready.");
            break;

        case 'backend_exited':
            outputChannel.appendLine(`Backend exited with code ${msg.code}`);
            statusBar.setError('Backend stopped');
            vscode.window.showErrorMessage(
                `AlpenCode backend exited (code: ${msg.code}). Check 'AlpenCode' output for details.`,
                'Restart backend', 'Open Logs'
            ).then(selection => {
                if (selection === 'Restart backend') {
                    (async () => {
                        if (!extensionContext) {
                            vscode.window.showErrorMessage('Extension context not available. Cannot restart backend.');
                            return;
                        }
                        const pythonPath = await ensurePythonEnvironment(extensionContext, outputChannel).catch(() => undefined) as string | undefined;
                        // If ensurePythonEnvironment returns a path, restart
                        if (pythonPath) {
                            backend.start(pythonPath, extensionContext.extensionPath);
                            statusBar.setReady();
                        } else {
                            vscode.window.showErrorMessage('Could not find Python environment. Try running Reset Environment.');
                        }
                    })();
                } else if (selection === 'Open Logs') {
                    outputChannel.show();
                }
            });
            break;

        case 'status':
            outputChannel.appendLine(`Status: ${msg.message}`);
            break;

        case 'transcription':
            insertText(msg.text);
            statusBar.setReady();
            break;

        case 'error':
            vscode.window.showErrorMessage(`AlpenCode Error: ${msg.message}`);
            statusBar.setReady();
            break;

        // --- Settings Panel Kommunikation ---
        case 'devices':
            if (SettingsPanel.currentPanel) {
                SettingsPanel.currentPanel.sendData('devices', msg.devices);
            }
            break;

        case 'calibration_level':
            if (SettingsPanel.currentPanel) {
                SettingsPanel.currentPanel.sendData('calibration_level', msg.value);
            }
            break;
        case 'backend_not_running':
            // When the manager can't send, show a one-time helper to the user
            vscode.window.showWarningMessage('AlpenCode backend is not running. Would you like to restart it?', 'Restart', 'Open Logs')
                .then(selection => {
                    if (selection === 'Restart') {
                        (async () => {
                            if (!extensionContext) {
                                vscode.window.showErrorMessage('Extension context is missing.');
                                return;
                            }
                            const pythonPath = await ensurePythonEnvironment(extensionContext, outputChannel).catch(() => undefined) as string | undefined;
                            if (pythonPath) {
                                backend.start(pythonPath, extensionContext.extensionPath);
                                statusBar.setReady();
                            } else {
                                vscode.window.showErrorMessage('Could not start Python environment. Use Reset Environment to reinstall.');
                            }
                        })();
                    } else if (selection === 'Open Logs') {
                        outputChannel.show();
                    }
                });
            break;

        case 'calibration_result':
            vscode.window.showInformationMessage(
                `Noise Level: ${msg.rms}. Suggested Threshold: ${msg.suggestion}`,
                "Apply Suggestion"
            ).then(selection => {
                if (selection === "Apply Suggestion") {
                    backend.send(`set_config_val silence_threshold ${msg.suggestion}`);
                    vscode.window.showInformationMessage(`Threshold set to ${msg.suggestion}`);
                }
            });

            if (SettingsPanel.currentPanel) {
                SettingsPanel.currentPanel.sendData('calibration_result', msg);
            }
            break;
        case 'config_info':
            if (SettingsPanel.currentPanel) {
                SettingsPanel.currentPanel.sendData('init_settings', {
                    threshold: msg.threshold,
                    device: msg.device,
                    auto_enter_active: msg.auto_enter_active,
                    streaming_active: msg.streaming_active,
                    stream_pause: msg.stream_pause,
                    auto_stop_delay: msg.auto_stop_delay
                });
            }
            break;
    }
}

function insertText(text: string) {
    const config = vscode.workspace.getConfiguration('alpencode');
    const autoEnter = config.get<boolean>('autoEnter', false);

    if (text && text.length > 0) {

        const textToType = text + (autoEnter ? "" : " ");
        backend.send(`type_text ${textToType}`);

        if (autoEnter) {
            setTimeout(() => {
                backend.send('press_enter');
            }, 100);
        }
    }
}


export function deactivate() {
    backend?.stop();
    statusBar?.dispose();
}