$code = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class ShellIconReal {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct SHFILEINFO {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    };

    [DllImport("shell32.dll", CharSet = CharSet.Auto)]
    public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, out SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    public static string GetBase64Icon(string path, bool useAttributes) {
        SHFILEINFO shinfo = new SHFILEINFO();
        uint SHGFI_ICON = 0x100;
        uint SHGFI_SMALLICON = 0x1;
        uint SHGFI_USEFILEATTRIBUTES = 0x10;
        
        uint flags = SHGFI_ICON | SHGFI_SMALLICON;
        if (useAttributes) {
            flags |= SHGFI_USEFILEATTRIBUTES;
        }

        IntPtr res = SHGetFileInfo(path, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        if (res == IntPtr.Zero || shinfo.hIcon == IntPtr.Zero) return "";
        
        Icon icon = Icon.FromHandle(shinfo.hIcon);
        System.IO.MemoryStream ms = new System.IO.MemoryStream();
        icon.ToBitmap().Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        string b64 = Convert.ToBase64String(ms.ToArray());
        
        DestroyIcon(shinfo.hIcon);
        return b64;
    }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing
Write-Output "Real EXE:"
Write-Output ([ShellIconReal]::GetBase64Icon("C:\Windows\System32\notepad.exe", $false).Substring(0, 50))
Write-Output "Extension EXE:"
Write-Output ([ShellIconReal]::GetBase64Icon(".exe", $true).Substring(0, 50))
