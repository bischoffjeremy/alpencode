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
        const isWin = process.platform === 'win32';
        const pythonExecutable = isWin ? 'python.exe' : 'python';
        const venvFolder = isWin ? 'Scripts' : 'bin';
        const pythonPath = path.join(venvPath, venvFolder, pythonExecutable);
        const requirementsPath = path.join(context.extensionPath, 'python', 'requirements.txt');
        if (fs.existsSync(pythonPath)) {
            return pythonPath;
        }
        const choice = yield vscode.window.showInformationMessage("AlpenCode needs to install Python AI models (approx. 2GB). This happens only once.", "Install Now", "Cancel");
        if (choice !== "Install Now") {
            return undefined;
        }
        outputChannel.show();
        outputChannel.appendLine("Starting setup...");
        try {
            let useUv = false;
            try {
                cp.execSync('uv --version');
                useUv = true;
                outputChannel.appendLine("🚀 Found 'uv' package manager. Using it for speed.");
            }
            catch (_a) {
                outputChannel.appendLine("ℹ️ 'uv' not found. Using standard pip.");
            }
            if (useUv) {
                yield runCommand('uv', ['venv', venvPath], context.extensionPath, outputChannel);
                outputChannel.appendLine("Installing PyTorch (CUDA 11.8)...");
                yield runCommand('uv', ['pip', 'install', '-p', pythonPath, 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath, outputChannel);
                outputChannel.appendLine("Installing dependencies...");
                yield runCommand('uv', ['pip', 'install', '-p', pythonPath, '-r', requirementsPath], context.extensionPath, outputChannel);
            }
            else {
                const sysPython = isWin ? 'python' : 'python3';
                yield runCommand(sysPython, ['-m', 'venv', venvPath], context.extensionPath, outputChannel);
                outputChannel.appendLine("Upgrading pip...");
                yield runCommand(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], context.extensionPath, outputChannel);
                outputChannel.appendLine("Installing PyTorch (CUDA 11.8)...");
                yield runCommand(pythonPath, ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath, outputChannel);
                outputChannel.appendLine("Installing dependencies...");
                yield runCommand(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath], context.extensionPath, outputChannel);
            }
            vscode.window.showInformationMessage("AlpenCode installation complete! 🚀");
            return pythonPath;
        }
        catch (e) {
            vscode.window.showErrorMessage(`Installation failed. Check 'AlpenCode' output.`);
            outputChannel.appendLine(`FATAL ERROR: ${e}`);
            return undefined;
        }
    });
}
function runCommand(command, args, cwd, outputChannel) {
    return new Promise((resolve, reject) => {
        outputChannel.appendLine(`> ${command} ${args.join(' ')}`);
        const proc = cp.spawn(command, args, { cwd, shell: true });
        proc.stdout.on('data', (data) => outputChannel.append(data.toString()));
        proc.stderr.on('data', (data) => outputChannel.append(data.toString()));
        proc.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(`Command exited with code ${code}`);
        });
        proc.on('error', (err) => reject(err.message));
    });
}
//# sourceMappingURL=installer.js.map