$code = @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public class ShellIconHiRes {
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

    [DllImport("shell32.dll", EntryPoint = "#727")]
    public static extern int SHGetImageList(int iImageList, ref Guid riid, ref IntPtr ppv);

    [DllImport("comctl32.dll", SetLastError = true)]
    public static extern IntPtr ImageList_GetIcon(IntPtr himl, int i, int flags);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    // iImageList: 0=small(16), 1=large(32), 2=extralarge(48), 4=jumbo(256)
    public static string GetBase64Icon(string targetPath, bool useAttr, int imageListSize) {
        SHFILEINFO shinfo = new SHFILEINFO();
        uint flags = 0x4000 | 0x1; // SHGFI_SYSICONINDEX | SHGFI_SMALLICON
        if (useAttr) flags |= 0x10;
        
        IntPtr res = SHGetFileInfo(targetPath, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        
        if ((res == IntPtr.Zero) && !useAttr) {
            string ext = System.IO.Path.GetExtension(targetPath);
            if (string.IsNullOrEmpty(ext)) return "";
            flags |= 0x10;
            res = SHGetFileInfo(ext, 0x80, out shinfo, (uint)Marshal.SizeOf(shinfo), flags);
        }
        if (res == IntPtr.Zero) return "";

        Guid iidImageList = new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");
        IntPtr imageList = IntPtr.Zero;
        SHGetImageList(imageListSize, ref iidImageList, ref imageList);
        
        if (imageList == IntPtr.Zero) return "";
        
        IntPtr hIcon = ImageList_GetIcon(imageList, shinfo.iIcon, 0);
        if (hIcon == IntPtr.Zero) return "";
        
        Icon icon = Icon.FromHandle(hIcon);
        System.IO.MemoryStream ms = new System.IO.MemoryStream();
        icon.ToBitmap().Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        string b64 = Convert.ToBase64String(ms.ToArray());
        DestroyIcon(hIcon);
        return b64;
    }
}
"@

Add-Type -TypeDefinition $code -ReferencedAssemblies System.Drawing

Write-Output "Small (16x16):"
$b = [ShellIconHiRes]::GetBase64Icon(".xlsx", $true, 0)
Write-Output "Length: $($b.Length)"

Write-Output "Large (32x32):"
$b = [ShellIconHiRes]::GetBase64Icon(".xlsx", $true, 1)
Write-Output "Length: $($b.Length)"

Write-Output "ExtraLarge (48x48):"
$b = [ShellIconHiRes]::GetBase64Icon(".xlsx", $true, 2)
Write-Output "Length: $($b.Length)"

Write-Output "Jumbo (256x256):"
$b = [ShellIconHiRes]::GetBase64Icon(".xlsx", $true, 4)
Write-Output "Length: $($b.Length)"
