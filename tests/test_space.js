const { exec } = require('child_process');
exec(`powershell -ExecutionPolicy Bypass -File "C:\\Users\\musil\\OneDrive\\Moje poznámky\\.obsidian\\plugins\\native-os-icons\\getIcon.ps1" ".xlsx"`, (error, stdout, stderr) => {
    console.log('ERROR:', error);
    console.log('STDERR:', stderr);
    console.log('OUT:', stdout.substring(0, 50));
});
