import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';

export class PythonBackendManager {
    private process: cp.ChildProcess | undefined;
    private outputChannel: vscode.OutputChannel;
    private onMessageCallback: (msg: any) => void;
    private intentionalStop: boolean = false; // <--- NEU: Flag für gewollten Stopp

    constructor(outputChannel: vscode.OutputChannel, onMessage: (msg: any) => void) {
        this.outputChannel = outputChannel;
        this.onMessageCallback = onMessage;
    }

    public start(pythonPath: string, extensionPath: string) {
        this.intentionalStop = false; // <--- Reset beim Start
        const scriptPath = path.join(extensionPath, 'python', 'main.py');
        this.outputChannel.appendLine(`Starting Backend: ${pythonPath} ${scriptPath}`);

        const env = { 
            ...process.env, 
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8' 
        };
        
        try {
            this.process = cp.spawn(pythonPath, [scriptPath], { 
                env, 
                cwd: path.join(extensionPath, 'python') 
            });

            if (this.process.stdout) {
                this.process.stdout.setEncoding('utf8');
                this.process.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const msg = JSON.parse(line);
                            this.onMessageCallback(msg);
                        } catch (e) {
                            // ignore partial JSON
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
                // <--- WICHTIGE ÄNDERUNG HIER:
                if (this.intentionalStop) {
                    this.outputChannel.appendLine("Backend stopped intentionally.");
                    this.intentionalStop = false; // Reset
                    return; // KEINE Fehlermeldung an UI senden
                }

                this.outputChannel.appendLine(`Python backend exited with code ${code}`);
                try {
                    this.onMessageCallback({ type: 'backend_exited', code });
                } catch (e) { }
                this.process = undefined;
            });
        } catch (e) {
            this.outputChannel.appendLine(`Failed to spawn process: ${e}`);
        }
    }

    public stop() {
        if (this.process) {
            this.intentionalStop = true; // <--- Wir sagen: Das ist Absicht!
            this.process.kill();
            // Nicht sofort undefined setzen, lass das 'close' Event das Aufräumen übernehmen
            // this.process = undefined; 
        }
    }

    public send(command: string) {
        if (this.process && this.process.stdin && !this.process.killed) {
            try {
                this.process.stdin.write(command + '\n', (err) => {
                    if (err) this.outputChannel.appendLine(`Write error: ${err}`);
                });
            } catch (e) {
                this.outputChannel.appendLine(`Failed to send command: ${e}`);
            }
        }
    }

    public isRunning(): boolean {
        return this.process !== undefined && !this.process.killed;
    }
}