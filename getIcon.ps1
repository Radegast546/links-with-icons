param(
    [Parameter(Mandatory=$true)]
    [string]$Extension
)

Add-Type -AssemblyName System.Drawing
$dummy = [System.IO.Path]::GetTempFileName() + $Extension
[System.IO.File]::Create($dummy).Close()
try {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($dummy)
    $ms = New-Object System.IO.MemoryStream
    $icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $b64 = [Convert]::ToBase64String($ms.ToArray())
    Write-Output "data:image/png;base64,$b64"
} catch {
    Write-Output ""
} finally {
    Remove-Item $dummy -Force -ErrorAction SilentlyContinue
}
