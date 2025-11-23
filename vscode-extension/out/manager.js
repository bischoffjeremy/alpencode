"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonBackendManager = void 0;
const cp = require("child_process");
const path = require("path");
class PythonBackendManager {
    constructor(outputChannel, onMessage) {
        this.outputChannel = outputChannel;
        this.onMessageCallback = onMessage;
    }
    start(pythonPath, extensionPath) {
        const scriptPath = path.join(extensionPath, 'python', 'main.py');
        this.outputChannel.appendLine(`Starting Backend: ${pythonPath} ${scriptPath}`);
        const env = Object.assign(Object.assign({}, process.env), { PYTHONUNBUFFERED: '1' });
        try {
            this.process = cp.spawn(pythonPath, [scriptPath], { env });
            if (this.process.stdout) {
                this.process.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    for (const line of lines) {
                        if (!line.trim())
                            continue;
                        try {
                            const msg = JSON.parse(line);
                            this.onMessageCallback(msg);
                        }
                        catch (e) {
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
        }
        catch (e) {
            this.outputChannel.appendLine(`Failed to spawn process: ${e}`);
        }
    }
    stop() {
        if (this.process) {
            this.process.kill();
            this.process = undefined;
        }
    }
    send(command) {
        if (this.process && this.process.stdin) {
            try {
                this.process.stdin.write(command + '\n');
            }
            catch (e) {
                this.outputChannel.appendLine(`Failed to send command: ${e}`);
            }
        }
        else {
            this.outputChannel.appendLine("Cannot send command: Backend not running");
        }
    }
    isRunning() {
        return this.process !== undefined;
    }
}
exports.PythonBackendManager = PythonBackendManager;
//# sourceMappingURL=manager.js.map