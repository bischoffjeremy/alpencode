import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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