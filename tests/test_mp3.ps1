$code = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class ShellIconReal2 {
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

    public static string GetBase64Icon(string path, bool useAttr) {
        SHFILEINFO shinfo = new SHFILEINFO();
        uint flags = 0x100 | 0x1; 
        if (useAttr) flags |= 0x10;

        IntPtr res = SHGetFileInfo(path, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        if (res == IntPtr.Zero || shinfo.hIcon == IntPtr.Zero) return "FAIL";
        return "SUCCESS";
    }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing
Write-Output "File with useAttr=false:"
Write-Output ([ShellIconReal2]::GetBase64Icon("C:\Users\musil\Desktop\test.mp3", $false))
Write-Output "Extension with useAttr=true:"
Write-Output ([ShellIconReal2]::GetBase64Icon(".mp3", $true))
