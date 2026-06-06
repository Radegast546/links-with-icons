const { exec } = require('child_process');

function runPowerShellScript(ext) {
    const psScript = `
        Add-Type -AssemblyName System.Drawing
        $dummy = [System.IO.Path]::GetTempFileName() + '${ext}'
        [System.IO.File]::Create($dummy).Close()
        try {
            $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($dummy)
            $ms = New-Object System.IO.MemoryStream
            $icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $b64 = [Convert]::ToBase64String($ms.ToArray())
            Write-Output "data:image/png;base64,$b64"
        } catch {} finally {
            Remove-Item $dummy -Force -ErrorAction SilentlyContinue
        }
    `;

    // Convert string to UTF-16LE Buffer
    const buffer = Buffer.from(psScript, 'utf16le');
    const encodedCommand = buffer.toString('base64');

    exec(`powershell -ExecutionPolicy Bypass -EncodedCommand ${encodedCommand}`, (error, stdout, stderr) => {
        console.log('ERROR:', error);
        console.log('STDERR:', stderr);
        console.log('OUT:', stdout.substring(0, 50));
    });
}

runPowerShellScript('.xlsx');
