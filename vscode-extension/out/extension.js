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
const installer_1 = require("./installer");
const manager_1 = require("./manager");
const statusBar_1 = require("./ui/statusBar");
const settingsPanel_1 = require("./ui/settingsPanel"); // WICHTIG!
let backend;
let statusBar;
let outputChannel;
let extensionContext;
function activate(context) {
    return __awaiter(this, void 0, void 0, function* () {
        extensionContext = context;
        outputChannel = vscode.window.createOutputChannel("AlpenCode");
        statusBar = new statusBar_1.StatusBarManager();
        // Backend Init
        backend = new manager_1.PythonBackendManager(outputChannel, handleBackendMessage);
        // Environment Check
        const pythonPath = yield (0, installer_1.ensurePythonEnvironment)(context, outputChannel);
        if (pythonPath) {
            backend.start(pythonPath, context.extensionPath);
        }
        else {
            statusBar.setError("Setup Failed");
        }
        registerCommands(context);
    });
}
function registerCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand('alpencode.start', () => {
        backend.send('start');
        statusBar.setRecording();
    }), vscode.commands.registerCommand('alpencode.stop', () => {
        backend.send('stop');
        statusBar.setProcessing();
    }), vscode.commands.registerCommand('alpencode.toggle', () => {
        if (statusBar.text.includes("Recording")) {
            vscode.commands.executeCommand('alpencode.stop');
        }
        else {
            vscode.commands.executeCommand('alpencode.start');
        }
    }), 
    // HIER WAR DEIN FEHLER VERMUTLICH:
    vscode.commands.registerCommand('alpencode.settings', () => {
        settingsPanel_1.SettingsPanel.createOrShow(context.extensionPath, backend);
    }), vscode.commands.registerCommand('alpencode.calibrate', () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "🎤 Calibrating... Please stay silent.",
            cancellable: false
        }, (progress) => __awaiter(this, void 0, void 0, function* () {
            backend.send('calibrate');
            yield new Promise(resolve => setTimeout(resolve, 4000));
        }));
    }), vscode.commands.registerCommand('alpencode.resetEnv', () => __awaiter(this, void 0, void 0, function* () {
        const choice = yield vscode.window.showWarningMessage("Delete AlpenCode Python environment? It will reinstall next time.", "Yes, Delete", "Cancel");
        if (choice === "Yes, Delete") {
            if (backend.isRunning()) {
                backend.stop();
                statusBar.setReady();
            }
            try {
                const uninstalled = yield (0, installer_1.uninstallAlpenCode)(context, outputChannel);
                if (uninstalled) {
                    outputChannel.appendLine('Uninstalled environment; now reinstalling...');
                    const pythonPath = yield (0, installer_1.ensurePythonEnvironment)(context, outputChannel);
                    if (pythonPath) {
                        backend.start(pythonPath, context.extensionPath);
                    }
                    const reload = yield vscode.window.showInformationMessage('Deleted. Reload window?', 'Reload');
                    if (reload === 'Reload')
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            }
            catch (e) {
                vscode.window.showErrorMessage(`Error: ${e}`);
            }
        }
    })), vscode.commands.registerCommand('alpencode.resetInstall', () => __awaiter(this, void 0, void 0, function* () {
        // Reset = Uninstall + Install
        if (backend.isRunning()) {
            backend.stop();
            statusBar.setReady();
        }
        const confirm = yield vscode.window.showWarningMessage('Reset installation? This will remove venv, models, settings & recordings and reinstall everything.', 'Reset', 'Cancel');
        if (confirm !== 'Reset')
            return;
        try {
            const uninstalled = yield (0, installer_1.uninstallAlpenCode)(context, outputChannel);
            if (!uninstalled) {
                vscode.window.showErrorMessage('Reset cancelled or uninstall failed.');
                return;
            }
            outputChannel.appendLine('Uninstall successful, starting reinstall...');
            const pythonPath = yield (0, installer_1.ensurePythonEnvironment)(context, outputChannel);
            if (pythonPath) {
                backend.start(pythonPath, context.extensionPath);
                const reload = yield vscode.window.showInformationMessage('AlpenCode reinstalled successfully. Reload window?', 'Reload');
                if (reload === 'Reload')
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
            else {
                vscode.window.showErrorMessage('Re-installation failed. See output for details.');
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Reset failed: ${e}`);
        }
    })), vscode.commands.registerCommand('alpencode.uninstall', () => __awaiter(this, void 0, void 0, function* () {
        if (backend.isRunning()) {
            backend.stop();
            statusBar.setReady();
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
        try {
            const res = yield (0, installer_1.uninstallAlpenCode)(context, outputChannel);
            if (res) {
                const reload = yield vscode.window.showInformationMessage('AlpenCode Uninstall complete. Reload window?', 'Reload');
                if (reload === 'Reload')
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`Uninstall failed: ${e}`);
        }
    })));
}
function handleBackendMessage(msg) {
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
            vscode.window.showErrorMessage(`AlpenCode backend exited (code: ${msg.code}). Check 'AlpenCode' output for details.`, 'Restart backend', 'Open Logs').then(selection => {
                if (selection === 'Restart backend') {
                    (() => __awaiter(this, void 0, void 0, function* () {
                        if (!extensionContext) {
                            vscode.window.showErrorMessage('Extension context not available. Cannot restart backend.');
                            return;
                        }
                        const pythonPath = yield (0, installer_1.ensurePythonEnvironment)(extensionContext, outputChannel).catch(() => undefined);
                        // If ensurePythonEnvironment returns a path, restart
                        if (pythonPath) {
                            backend.start(pythonPath, extensionContext.extensionPath);
                            statusBar.setReady();
                        }
                        else {
                            vscode.window.showErrorMessage('Could not find Python environment. Try running Reset Environment.');
                        }
                    }))();
                }
                else if (selection === 'Open Logs') {
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
            if (settingsPanel_1.SettingsPanel.currentPanel) {
                settingsPanel_1.SettingsPanel.currentPanel.sendData('devices', msg.devices);
            }
            break;
        case 'calibration_level':
            if (settingsPanel_1.SettingsPanel.currentPanel) {
                settingsPanel_1.SettingsPanel.currentPanel.sendData('calibration_level', msg.value);
            }
            break;
        case 'backend_not_running':
            // When the manager can't send, show a one-time helper to the user
            vscode.window.showWarningMessage('AlpenCode backend is not running. Would you like to restart it?', 'Restart', 'Open Logs')
                .then(selection => {
                if (selection === 'Restart') {
                    (() => __awaiter(this, void 0, void 0, function* () {
                        if (!extensionContext) {
                            vscode.window.showErrorMessage('Extension context is missing.');
                            return;
                        }
                        const pythonPath = yield (0, installer_1.ensurePythonEnvironment)(extensionContext, outputChannel).catch(() => undefined);
                        if (pythonPath) {
                            backend.start(pythonPath, extensionContext.extensionPath);
                            statusBar.setReady();
                        }
                        else {
                            vscode.window.showErrorMessage('Could not start Python environment. Use Reset Environment to reinstall.');
                        }
                    }))();
                }
                else if (selection === 'Open Logs') {
                    outputChannel.show();
                }
            });
            break;
        case 'calibration_result':
            vscode.window.showInformationMessage(`Noise Level: ${msg.rms}. Suggested Threshold: ${msg.suggestion}`, "Apply Suggestion").then(selection => {
                if (selection === "Apply Suggestion") {
                    backend.send(`set_config_val silence_threshold ${msg.suggestion}`);
                    vscode.window.showInformationMessage(`Threshold set to ${msg.suggestion}`);
                }
            });
            if (settingsPanel_1.SettingsPanel.currentPanel) {
                settingsPanel_1.SettingsPanel.currentPanel.sendData('calibration_result', msg);
            }
            break;
        case 'config_info':
            if (settingsPanel_1.SettingsPanel.currentPanel) {
                settingsPanel_1.SettingsPanel.currentPanel.sendData('init_settings', {
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
function insertText(text) {
    const config = vscode.workspace.getConfiguration('alpencode');
    const autoEnter = config.get('autoEnter', false);
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
function deactivate() {
    backend === null || backend === void 0 ? void 0 : backend.stop();
    statusBar === null || statusBar === void 0 ? void 0 : statusBar.dispose();
}
//# sourceMappingURL=extension.js.map