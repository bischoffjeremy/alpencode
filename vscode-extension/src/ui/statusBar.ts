import * as vscode from 'vscode';

export class StatusBarManager {
    private item: vscode.StatusBarItem;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.item.command = 'alpencode.toggle';
        this.item.text = "$(sync~spin) Init AlpenCode...";
        this.item.show();
    }

    public setReady() {
        this.item.text = "🇨🇭 AlpenCode Ready";
        this.item.backgroundColor = undefined;
        this.item.tooltip = "Click to toggle recording";
    }

    public setRecording() {
        this.item.text = "$(record) Recording...";
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    }

    public setProcessing() {
        this.item.text = "$(sync~spin) Processing...";
        this.item.backgroundColor = undefined;
    }

    public setError(message: string) {
        this.item.text = "$(error) AlpenCode Error";
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.tooltip = message;
    }

    public get text(): string {
        return this.item.text;
    }

    public dispose() {
        this.item.dispose();
    }
}