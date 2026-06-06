$code = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class ShellIconFolder {
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

    public static string GetBase64Icon(string path) {
        SHFILEINFO shinfo = new SHFILEINFO();
        uint flags = 0x100 | 0x1; 
        
        IntPtr res = SHGetFileInfo(path, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        if (res == IntPtr.Zero || shinfo.hIcon == IntPtr.Zero) return "FAIL";
        return "SUCCESS";
    }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing
Write-Output "Folder Documents:"
Write-Output ([ShellIconFolder]::GetBase64Icon("C:\Users\musil\Documents"))
Write-Output "Folder Desktop:"
Write-Output ([ShellIconFolder]::GetBase64Icon("C:\Users\musil\Desktop"))
