import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export async function ensurePythonEnvironment(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): Promise<string | undefined> {
    const venvPath = path.join(context.extensionPath, 'venv');
    const pythonPath = path.join(venvPath, 'bin', 'python');
    const requirementsPath = path.join(context.extensionPath, 'python', 'requirements.txt');

    // Check if venv exists
    if (!fs.existsSync(pythonPath)) {
        const choice = await vscode.window.showInformationMessage(
            "AlpenCode needs to install Python dependencies (approx. 2GB for AI models). This happens only once.",
            "Install Now", "Cancel"
        );

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
            } catch {
                outputChannel.appendLine("'uv' not found. Falling back to standard pip.");
            }

            if (useUv) {
                await runCommand('uv', ['venv', venvPath], context.extensionPath);
                outputChannel.appendLine("Installing dependencies with uv...");
                
                await runCommand('uv', ['pip', 'install', '-p', pythonPath, 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath);
                await runCommand('uv', ['pip', 'install', '-p', pythonPath, '-r', requirementsPath], context.extensionPath);
            } else {
                await runCommand('python3', ['-m', 'venv', venvPath], context.extensionPath);
                
                // 2. Upgrade pip
                outputChannel.appendLine("Upgrading pip...");
                await runCommand(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], context.extensionPath);

                // 3. Install dependencies
                outputChannel.appendLine("Installing dependencies (this may take a while)...");
                await runCommand(pythonPath, ['-m', 'pip', 'install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cu118'], context.extensionPath);
                
                await runCommand(pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath], context.extensionPath);
            }
            
            vscode.window.showInformationMessage("AlpenCode installation complete! 🚀");
        } catch (e) {
            vscode.window.showErrorMessage(`Installation failed: ${e}`);
            outputChannel.appendLine(`Error: ${e}`);
            return undefined;
        }
    }

    return pythonPath;
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = cp.spawn(command, args, { cwd });

        proc.stdout.on('data', (data) => console.log(data.toString()));
        proc.stderr.on('data', (data) => console.error(data.toString()));

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(`Command exited with code ${code}`);
        });
    });
}
