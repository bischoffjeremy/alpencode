import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export class PythonBackendManager {
    private process: cp.ChildProcess | undefined;
    private outputChannel: vscode.OutputChannel;
    private onMessageCallback: (msg: any) => void;

    constructor(outputChannel: vscode.OutputChannel, onMessage: (msg: any) => void) {
        this.outputChannel = outputChannel;
        this.onMessageCallback = onMessage;
    }

    public start(pythonPath: string, extensionPath: string) {
        const scriptPath = path.join(extensionPath, 'python', 'main.py');
        this.outputChannel.appendLine(`Starting Backend: ${pythonPath} ${scriptPath}`);

        const env = { ...process.env, PYTHONUNBUFFERED: '1' };
        
        try {
            this.process = cp.spawn(pythonPath, [scriptPath], { env });

            if (this.process.stdout) {
                this.process.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const msg = JSON.parse(line);
                            this.onMessageCallback(msg);
                        } catch (e) {
                            this.outputChannel.appendLine(`Raw output: ${line}`);
                        }
                    }
                });
            }

            if (this.process.stderr) {
                this.process.stderr.on('data', (data) => {
                    this.outputChannel.appendLine(`Python Error: ${data}`);
                });
            }

            this.process.on('close', (code) => {
                this.outputChannel.appendLine(`Python backend exited with code ${code}`);
                this.process = undefined;
            });
        } catch (e) {
            this.outputChannel.appendLine(`Failed to spawn process: ${e}`);
        }
    }

    public stop() {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }

    public send(command: string) {
        if (this.process && this.process.stdin) {
            try {
                this.process.stdin.write(command + '\n');
            } catch (e) {
                this.outputChannel.appendLine(`Failed to send command: ${e}`);
            }
        } else {
            this.outputChannel.appendLine("Cannot send command: Backend not running");
        }
    }

    public isRunning(): boolean {
        return this.process !== undefined;
    }
}