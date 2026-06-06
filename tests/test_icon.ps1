Add-Type -AssemblyName System.Drawing
$ext = '.xlsx'
$dummy = [System.IO.Path]::GetTempFileName() + $ext
[System.IO.File]::Create($dummy).Close()
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon($dummy)
$ms = New-Object System.IO.MemoryStream
$icon.ToBitmap().Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$b64 = [Convert]::ToBase64String($ms.ToArray())
Remove-Item $dummy
Write-Output $b64
