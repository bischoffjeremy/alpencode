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
exports.resetInstallation = resetInstallation;
exports.uninstallAlpenCode = uninstallAlpenCode;
const vscode = require("vscode");
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
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
// --------------------------------------------------------------------------------
// RESET FUNCTION
// --------------------------------------------------------------------------------
function resetInstallation(context, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        const msg = "Reset AlpenCode? This removes the venv, models, PERMANENT settings (Config) and TEMP recordings.";
        const choice = yield vscode.window.showWarningMessage(msg, 'Reset Installation', 'Reset', 'Cancel');
        if (choice === 'Cancel' || !choice)
            return false;
        const venvPath = path.join(context.extensionPath, 'venv');
        const homedir = os.homedir();
        const tempDir = os.tmpdir();
        // Cache Pfade (für torch/huggingface)
        const hfCache = process.env['HF_HOME'] || path.join(homedir, '.cache', 'huggingface');
        const hfHubCache = process.env['HF_HUB_CACHE'] || process.env['HF_HUB_HOME'] || path.join(homedir, '.cache', 'huggingface', 'hub');
        const transformersCache = process.env['TRANSFORMERS_CACHE'] || path.join(homedir, '.cache', 'huggingface', 'transformers');
        const torchCache = process.env['TORCH_HOME'] || path.join(homedir, '.cache', 'torch');
        // 1. PERMANENTE CONFIG (Muss gelöscht werden)
        // Logik muss exakt zum Python Skript passen!
        const configDir = process.platform === 'win32'
            ? path.join(process.env['APPDATA'] || path.join(homedir, 'AppData', 'Roaming'), 'AlpenCode')
            : path.join(homedir, '.config', 'alpencode');
        // 2. TEMPORÄRE AUFNAHMEN (Müssen gelöscht werden)
        const tempRecordingsDir = path.join(tempDir, 'AlpenCode_Recordings');
        try {
            // VENV löschen
            if (fs.existsSync(venvPath)) {
                outputChannel.appendLine(`Removing venv: ${venvPath}`);
                try {
                    if (process.platform === 'win32') {
                        yield runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${venvPath}"`], context.extensionPath, outputChannel);
                    }
                    else {
                        yield runCommand('rm', ['-rf', venvPath], context.extensionPath, outputChannel);
                    }
                }
                catch (e) {
                    outputChannel.appendLine(`Failed to remove venv: ${e}`);
                }
            }
            // Caches, Config und Temp Recordings löschen
            if (true) {
                const dirsToDelete = [hfCache, hfHubCache, transformersCache, torchCache, configDir, tempRecordingsDir];
                for (const dir of dirsToDelete) {
                    if (fs.existsSync(dir)) {
                        outputChannel.appendLine(`Removing directory: ${dir}`);
                        try {
                            if (process.platform === 'win32') {
                                yield runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${dir}"`], homedir, outputChannel);
                            }
                            else {
                                yield runCommand('rm', ['-rf', dir], homedir, outputChannel);
                            }
                        }
                        catch (e) {
                            outputChannel.appendLine(`Failed to remove ${dir}: ${e}`);
                        }
                    }
                }
            }
            outputChannel.appendLine('AlpenCode Reset complete. Config & Recordings deleted.');
            return true;
        }
        catch (e) {
            outputChannel.appendLine(`Reset failed: ${e}`);
            vscode.window.showErrorMessage(`Reset failed: ${e}`);
            return false;
        }
    });
}
// --------------------------------------------------------------------------------
// UNINSTALL FUNCTION
// --------------------------------------------------------------------------------
function uninstallAlpenCode(context, outputChannel) {
    return __awaiter(this, void 0, void 0, function* () {
        const msg = "Uninstall AlpenCode? This permanently removes models, config settings, and recordings.";
        const choice = yield vscode.window.showWarningMessage(msg, 'Uninstall', 'Cancel');
        if (choice === 'Cancel' || !choice)
            return false;
        const venvPath = path.join(context.extensionPath, 'venv');
        const homedir = os.homedir();
        const tempDir = os.tmpdir();
        const hfCache = process.env['HF_HOME'] || path.join(homedir, '.cache', 'huggingface');
        const torchCache = process.env['TORCH_HOME'] || path.join(homedir, '.cache', 'torch');
        // 1. PERMANENTE CONFIG
        const configDir = process.platform === 'win32'
            ? path.join(process.env['APPDATA'] || path.join(homedir, 'AppData', 'Roaming'), 'AlpenCode')
            : path.join(homedir, '.config', 'alpencode');
        // 2. TEMPORÄRE AUFNAHMEN
        const tempRecordingsDir = path.join(tempDir, 'AlpenCode_Recordings');
        try {
            if (fs.existsSync(venvPath)) {
                outputChannel.appendLine(`Uninstall: Removing venv: ${venvPath}`);
                try {
                    if (process.platform === 'win32') {
                        yield runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${venvPath}"`], context.extensionPath, outputChannel);
                    }
                    else {
                        yield runCommand('rm', ['-rf', venvPath], context.extensionPath, outputChannel);
                    }
                }
                catch (e) {
                    outputChannel.appendLine(`Uninstall failed to remove venv: ${e}`);
                }
            }
            // Alle Ordner sammeln und löschen
            const dirsToDelete = [hfCache, torchCache, configDir, tempRecordingsDir];
            for (const dir of dirsToDelete) {
                if (fs.existsSync(dir)) {
                    outputChannel.appendLine(`Uninstall: Removing: ${dir}`);
                    try {
                        if (process.platform === 'win32') {
                            yield runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${dir}"`], homedir, outputChannel);
                        }
                        else {
                            yield runCommand('rm', ['-rf', dir], homedir, outputChannel);
                        }
                    }
                    catch (e) {
                        outputChannel.appendLine(`Uninstall failed to remove ${dir}: ${e}`);
                    }
                }
            }
            outputChannel.appendLine('AlpenCode Uninstall complete.');
            return true;
        }
        catch (e) {
            outputChannel.appendLine(`Uninstall failed: ${e}`);
            vscode.window.showErrorMessage(`Uninstall failed: ${e}`);
            return false;
        }
    });
}
//# sourceMappingURL=installer.js.map