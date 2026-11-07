import { execFile } from 'child_process';
import { Buffer } from 'buffer';
import fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const source = fs.readFileSync('main.ts', 'utf8');
const templateMatch = source.match(/const psScript = `([\s\S]*?)`;/);
if (!templateMatch?.[1]) throw new Error('PowerShell extraction template not found.');

const script = templateMatch[1]
    .replace('${escapedPath}', '.txt')
    .replace('${psBool}', '$true')
    .replace('${imgListIdx}', '4');
const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');
const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand],
    { encoding: 'utf8', maxBuffer: 512 * 1024, timeout: 15_000, windowsHide: true },
);

const output = stdout.trim();
if (!output.startsWith('data:image/png;base64,')) {
    throw new Error('Native icon extraction returned invalid output.');
}

console.log(`Native extraction smoke test passed (${output.length} characters).`);
