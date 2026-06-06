const { exec } = require('child_process');
const path = require('path');

const ext = '.xlsx';
const scriptPath = path.join(__dirname, 'getIcon.ps1');

exec(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" "${ext}"`, (error, stdout, stderr) => {
    console.log("Error:", error);
    console.log("Stdout:", stdout.substring(0, 50) + "...");
    console.log("Stderr:", stderr);
});
