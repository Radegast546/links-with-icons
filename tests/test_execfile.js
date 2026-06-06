const { execFile } = require('child_process');
const ps1 = "C:\\Users\\musil\\OneDrive\\Moje poznámky\\.obsidian\\plugins\\native-os-icons\\getIcon.ps1";
execFile('powershell', ['-ExecutionPolicy', 'Bypass', '-File', ps1, '.xlsx'], { encoding: 'utf8' }, (error, stdout, stderr) => {
    console.log('ERROR:', error);
    console.log('STDERR:', stderr);
    console.log('OUT:', stdout.substring(0, 50));
});
