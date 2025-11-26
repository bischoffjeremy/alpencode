"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBarManager = void 0;
const vscode = require("vscode");
class StatusBarManager {
    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'alpencode.toggle';
        this.item.text = "$(sync~spin) Init AlpenCode...";
        this.item.show();
    }
    setReady() {
        this.item.text = "🇨🇭 AlpenCode Ready";
        this.item.backgroundColor = undefined;
        this.item.tooltip = "Click to toggle recording";
    }
    setRecording() {
        this.item.text = "$(record) Recording...";
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    setProcessing() {
        this.item.text = "$(sync~spin) Processing...";
        this.item.backgroundColor = undefined;
    }
    setError(message) {
        this.item.text = "$(error) AlpenCode Error";
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.tooltip = message;
    }
    get text() {
        return this.item.text;
    }
    dispose() {
        this.item.dispose();
    }
}
exports.StatusBarManager = StatusBarManager;
//# sourceMappingURL=statusBar.js.map