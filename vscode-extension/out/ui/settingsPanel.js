"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsPanel = void 0;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
class SettingsPanel {
    constructor(panel, extensionPath, backend) {
        this._panel = panel;
        this._extensionPath = extensionPath;
        this._backend = backend;
        this._panel.webview.html = this._getHtmlForWebview();
        // BEREINIGTES MESSAGE HANDLING
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refreshDevices':
                    this._backend.send('list_devices');
                    break;
                case 'get_config': // Wichtig: Exakt so wie in Python erwartet
                    this._backend.send('get_config');
                    break;
                case 'startMonitor':
                    this._backend.send('start_monitor');
                    break;
                case 'stopMonitor':
                    this._backend.send('stop_monitor');
                    break;
                case 'setConfigVal':
                    // ALLE Einstellungen laufen jetzt hierüber
                    // Python kümmert sich um die Logik (z.B. Device Switch)
                    this._backend.send(`set_config_val ${message.key} ${message.value}`);
                    // Config neu laden um UI zu aktualisieren
                    setTimeout(() => this._backend.send('get_config'), 100);
                    break;
            }
        });
        this._panel.onDidDispose(() => {
            this._backend.send('stop_monitor');
            SettingsPanel.currentPanel = undefined;
        });
    }
    static createOrShow(extensionPath, backend) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            backend.send('get_config');
            return;
        }
        const panel = vscode.window.createWebviewPanel('alpencodeSettings', 'AlpenCode Settings', column || vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'media'))]
        });
        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionPath, backend);
        // Initiale Daten laden
        backend.send('list_devices');
        backend.send('get_config');
    }
    sendData(type, data) {
        this._panel.webview.postMessage({ type, data });
    }
    _getHtmlForWebview() {
        const htmlPath = path.join(this._extensionPath, 'media', 'settings.html');
        try {
            return fs.readFileSync(htmlPath, 'utf8');
        }
        catch (e) {
            return `<html><body><h1>Error</h1><p>Could not load settings.html from ${htmlPath}</p></body></html>`;
        }
    }
}
exports.SettingsPanel = SettingsPanel;
//# sourceMappingURL=settingsPanel.js.map