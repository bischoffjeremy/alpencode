import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export async function ensurePythonEnvironment(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<string | undefined> {
    const venvPath = path.join(context.extensionPath, 'venv');
    
    const isWin = process.platform === 'win32';
    const pythonExecutable = isWin ? 'python.exe' : 'python';
    const venvFolder = isWin ? 'Scripts' : 'bin';
    const pythonPath = path.join(venvPath, venvFolder, pythonExecutable);
    
    const requirementsPath = path.join(context.extensionPath, 'python', 'requirements.txt');

    if (fs.existsSync(pythonPath)) {
        return pythonPath;
    }

    const choice = await vscode.window.showInformationMessage(
        "AlpenCode needs to install Python AI models (approx. 2GB). This happens only once.",
        "Install Now", "Cancel"
    );

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
        } catch {
            outputChannel.appendLine("ℹ️ 'uv' not found. Using standard pip.");
        }

        if (useUv) {
            await runCommand('uv', ['venv', venvPath], context.extensionPath, outputChannel);
            outputChannel.appendLine("Installing PyTorch (CUDA 11.8)...");
            await runCommand('uv', ['pip', 'install', '-p', pythonPath, 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath, outputChannel);
            outputChannel.appendLine("Installing dependencies...");
            await runCommand('uv', ['pip', 'install', '-p', pythonPath, '-r', requirementsPath], context.extensionPath, outputChannel);
        } else {
            const sysPython = isWin ? 'python' : 'python3';
            await runCommand(sysPython, ['-m', 'venv', venvPath], context.extensionPath, outputChannel);
            
            outputChannel.appendLine("Upgrading pip...");
            await runCommand(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], context.extensionPath, outputChannel);

            outputChannel.appendLine("Installing PyTorch (CUDA 11.8)...");
            await runCommand(pythonPath, ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath, outputChannel);
            
            outputChannel.appendLine("Installing dependencies...");
            await runCommand(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath], context.extensionPath, outputChannel);
        }
        
        vscode.window.showInformationMessage("AlpenCode installation complete! 🚀");
        return pythonPath;

    } catch (e) {
        vscode.window.showErrorMessage(`Installation failed. Check 'AlpenCode' output.`);
        outputChannel.appendLine(`FATAL ERROR: ${e}`);
        return undefined;
    }
}

function runCommand(command: string, args: string[], cwd: string, outputChannel: vscode.OutputChannel): Promise<void> {
    return new Promise((resolve, reject) => {
        outputChannel.appendLine(`> ${command} ${args.join(' ')}`);
        
        const proc = cp.spawn(command, args, { cwd, shell: true });

        proc.stdout.on('data', (data) => outputChannel.append(data.toString()));
        proc.stderr.on('data', (data) => outputChannel.append(data.toString()));

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(`Command exited with code ${code}`);
        });
        
        proc.on('error', (err) => reject(err.message));
    });
}

// NOTE: We intentionally do not provide a separate runRemoveCommand helper; deletions
// are done inline using runCommand so the caller controls behavior and logging.

export async function resetInstallation(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<boolean> {
    const msg = "Reset AlpenCode installation? This will remove the virtual environment (venv), downloaded model caches (HuggingFace/Torch), and saved settings & recordings. This operation will reinstall the environment afterwards.";
    const choice = await vscode.window.showWarningMessage(msg, 'Reset Installation', 'Reset', 'Cancel');
    if (choice === 'Cancel' || !choice) return false;

    const venvPath = path.join(context.extensionPath, 'venv');
    const homedir = os.homedir();
    const hfCache = process.env['HF_HOME'] || path.join(homedir, '.cache', 'huggingface');
    const hfHubCache = process.env['HF_HUB_CACHE'] || process.env['HF_HUB_HOME'] || path.join(homedir, '.cache', 'huggingface', 'hub');
    const transformersCache = process.env['TRANSFORMERS_CACHE'] || path.join(homedir, '.cache', 'huggingface', 'transformers');
    const torchCache = process.env['TORCH_HOME'] || path.join(homedir, '.cache', 'torch');
    const configDir = process.platform === 'win32' ? (process.env['APPDATA'] || path.join(homedir, 'AppData', 'Roaming')) : path.join(homedir, '.config', 'swiss_whisper');

    try {
        if (fs.existsSync(venvPath)) {
            outputChannel.appendLine(`Removing venv: ${venvPath}`);
            try {
                if (process.platform === 'win32') {
                    await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${venvPath}"`], context.extensionPath, outputChannel);
                } else {
                    await runCommand('rm', ['-rf', venvPath], context.extensionPath, outputChannel);
                }
            } catch (e) {
                outputChannel.appendLine(`Failed to remove venv with runCommand: ${e}`);
            }
        }

        // Always delete caches/config when resetting
        if (true) {
            const hfArrays = [hfCache, hfHubCache, transformersCache];
            for (const hfItem of hfArrays) {
                if (fs.existsSync(hfItem)) {
                    outputChannel.appendLine(`Removing HuggingFace item: ${hfItem}`);
                    try {
                        if (process.platform === 'win32') {
                            await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${hfItem}"`], homedir, outputChannel);
                        } else {
                            await runCommand('rm', ['-rf', hfItem], homedir, outputChannel);
                        }
                    } catch (e) {
                        outputChannel.appendLine(`Failed to remove ${hfItem} with runCommand: ${e}`);
                    }
                }
            }
            if (fs.existsSync(torchCache)) {
                outputChannel.appendLine(`Removing Torch cache: ${torchCache}`);
                try {
                    if (process.platform === 'win32') {
                        await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${torchCache}"`], homedir, outputChannel);
                    } else {
                        await runCommand('rm', ['-rf', torchCache], homedir, outputChannel);
                    }
                } catch (e) {
                    outputChannel.appendLine(`Failed to remove torchCache with runCommand: ${e}`);
                }
            }
            if (fs.existsSync(configDir)) {
                outputChannel.appendLine(`Removing config dir: ${configDir}`);
                try {
                    if (process.platform === 'win32') {
                        await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${configDir}"`], homedir, outputChannel);
                    } else {
                        await runCommand('rm', ['-rf', configDir], homedir, outputChannel);
                    }
                } catch (e) {
                    outputChannel.appendLine(`Failed to remove configDir with runCommand: ${e}`);
                }
            }
            // Also remove recorded audio folder if used
            const defaultSaveFolder = path.join(homedir, 'SwissWhisper_Aufnahmen');
            try {
                if (fs.existsSync(defaultSaveFolder)) {
                    outputChannel.appendLine(`Removing saved recordings folder: ${defaultSaveFolder}`);
                    if (process.platform === 'win32') {
                        await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${defaultSaveFolder}"`], homedir, outputChannel);
                    } else {
                        await runCommand('rm', ['-rf', defaultSaveFolder], homedir, outputChannel);
                    }
                }
            } catch (e) {
                outputChannel.appendLine(`Failed to remove saved recordings folder: ${e}`);
            }
        }

        outputChannel.appendLine('AlpenCode Installation Reset performed.');
        return true;
    } catch (e) {
        outputChannel.appendLine(`Reset failed: ${e}`);
        vscode.window.showErrorMessage(`Reset failed: ${e}`);
        return false;
    }
}

export async function uninstallAlpenCode(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<boolean> {
    const msg = "Uninstall AlpenCode? This will remove the virtual environment (venv), downloaded model caches and settings & recordings. This is permanent.";
    const choice = await vscode.window.showWarningMessage(msg, 'Uninstall', 'Cancel');
    if (choice === 'Cancel' || !choice) return false;

    const venvPath = path.join(context.extensionPath, 'venv');
    const homedir = os.homedir();
    const hfCache = process.env['HF_HOME'] || path.join(homedir, '.cache', 'huggingface');
    const torchCache = process.env['TORCH_HOME'] || path.join(homedir, '.cache', 'torch');
    const configDir = process.platform === 'win32' ? (process.env['APPDATA'] || path.join(homedir, 'AppData', 'Roaming')) : path.join(homedir, '.config', 'swiss_whisper');

    try {
        if (fs.existsSync(venvPath)) {
            outputChannel.appendLine(`Uninstall: Removing venv: ${venvPath}`);
            try {
                if (process.platform === 'win32') {
                    await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${venvPath}"`], context.extensionPath, outputChannel);
                } else {
                    await runCommand('rm', ['-rf', venvPath], context.extensionPath, outputChannel);
                }
            } catch (e) {
                outputChannel.appendLine(`Uninstall failed to remove venv with runCommand: ${e}`);
            }
        }

        // Delete caches & config & saved recordings as part of uninstall
        if (fs.existsSync(hfCache)) {
            outputChannel.appendLine(`Uninstall: Removing HuggingFace cache: ${hfCache}`);
                outputChannel.appendLine(`Uninstall: Removing HuggingFace cache: ${hfCache}`);
                try {
                    if (process.platform === 'win32') {
                        await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${hfCache}"`], homedir, outputChannel);
                    } else {
                        await runCommand('rm', ['-rf', hfCache], homedir, outputChannel);
                    }
                } catch (e) {
                    outputChannel.appendLine(`Uninstall failed to remove hfCache with runCommand: ${e}`);
                }
            }
        if (fs.existsSync(torchCache)) {
                outputChannel.appendLine(`Uninstall: Removing Torch cache: ${torchCache}`);
                try {
                    if (process.platform === 'win32') {
                        await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${torchCache}"`], homedir, outputChannel);
                    } else {
                        await runCommand('rm', ['-rf', torchCache], homedir, outputChannel);
                    }
                } catch (e) {
                    outputChannel.appendLine(`Uninstall failed to remove torchCache with runCommand: ${e}`);
                }
            }
        if (fs.existsSync(configDir)) {
                outputChannel.appendLine(`Uninstall: Removing config dir: ${configDir}`);
                try {
                    if (process.platform === 'win32') {
                        await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${configDir}"`], homedir, outputChannel);
                    } else {
                        await runCommand('rm', ['-rf', configDir], homedir, outputChannel);
                    }
                } catch (e) {
                    outputChannel.appendLine(`Uninstall failed to remove configDir with runCommand: ${e}`);
                }
        }
        // Also remove default recordings folder
        const defaultSaveFolder = path.join(homedir, 'SwissWhisper_Aufnahmen');
        if (fs.existsSync(defaultSaveFolder)) {
            outputChannel.appendLine(`Uninstall: Removing saved recordings folder: ${defaultSaveFolder}`);
            try {
                if (process.platform === 'win32') {
                    await runCommand('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force -LiteralPath "${defaultSaveFolder}"`], homedir, outputChannel);
                } else {
                    await runCommand('rm', ['-rf', defaultSaveFolder], homedir, outputChannel);
                }
            } catch (e) {
                outputChannel.appendLine(`Uninstall failed to remove saved recordings: ${e}`);
            }
    }

    outputChannel.appendLine('AlpenCode Uninstall performed.');
        return true;
    } catch (e) {
        outputChannel.appendLine(`Uninstall failed: ${e}`);
        vscode.window.showErrorMessage(`Uninstall failed: ${e}`);
        return false;
    }
}