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
exports.ensurePythonEnvironment = ensurePythonEnvironment;
const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
function ensurePythonEnvironment(context, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        const venvPath = path.join(context.extensionPath, 'venv');
        const pythonPath = path.join(venvPath, 'bin', 'python');
        const requirementsPath = path.join(context.extensionPath, 'python', 'requirements.txt');
        // Check if venv exists
        if (!fs.existsSync(pythonPath)) {
            const choice = yield vscode.window.showInformationMessage("AlpenCode needs to install Python dependencies (approx. 2GB for AI models). This happens only once.", "Install Now", "Cancel");
            if (choice !== "Install Now") {
                return undefined;
            }
            outputChannel.show();
            outputChannel.appendLine("Creating virtual environment...");
            try {
                // 1. Create venv
                // Check if 'uv' is installed
                let useUv = false;
                try {
                    cp.execSync('uv --version');
                    useUv = true;
                    outputChannel.appendLine("Found 'uv'. Using it for faster installation.");
                }
                catch (_a) {
                    outputChannel.appendLine("'uv' not found. Falling back to standard pip.");
                }
                if (useUv) {
                    yield runCommand('uv', ['venv', venvPath], context.extensionPath);
                    outputChannel.appendLine("Installing dependencies with uv...");
                    yield runCommand('uv', ['pip', 'install', '-p', pythonPath, 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath);
                    yield runCommand('uv', ['pip', 'install', '-p', pythonPath, '-r', requirementsPath], context.extensionPath);
                }
                else {
                    yield runCommand('python3', ['-m', 'venv', venvPath], context.extensionPath);
                    // 2. Upgrade pip
                    outputChannel.appendLine("Upgrading pip...");
                    yield runCommand(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], context.extensionPath);
                    // 3. Install dependencies
                    outputChannel.appendLine("Installing dependencies (this may take a while)...");
                    yield runCommand(pythonPath, ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath);
                    yield runCommand(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath], context.extensionPath);
                }
                vscode.window.showInformationMessage("AlpenCode installation complete! 🚀");
            }
            catch (e) {
                vscode.window.showErrorMessage(`Installation failed: ${e}`);
                outputChannel.appendLine(`Error: ${e}`);
                return undefined;
            }
        }
        return pythonPath;
    });
}
function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn(command, args, { cwd });
        proc.stdout.on('data', (data) => console.log(data.toString()));
        proc.stderr.on('data', (data) => console.error(data.toString()));
        proc.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(`Command exited with code ${code}`);
        });
    });
}
//# sourceMappingURL=installer.js.map