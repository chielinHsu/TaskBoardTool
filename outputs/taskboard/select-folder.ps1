param([string]$InitialPath = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
# 新式（Vista 起）資料夾選擇視窗：有網址列，可直接輸入或貼上完整路徑；舊的 FolderBrowserDialog 只有樹狀清單。
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class TaskboardFolderDialog {
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogClass {}
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint count, IntPtr types);
        void SetFileTypeIndex(uint index);
        void GetFileTypeIndex(out uint index);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem item);
        void SetFolder(IShellItem item);
        void GetFolder(out IShellItem item);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
    }
    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
        void BindToHandler(IntPtr bindContext, ref Guid handler, ref Guid iid, out IntPtr result);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint form, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr bindContext, [MarshalAs(UnmanagedType.LPStruct)] Guid iid, out IShellItem item);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, IntPtr process);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint to, bool enable);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr window);

    // 看板服務在背景執行，Windows 預設不讓背景程序搶前景；借用目前前景視窗的輸入佇列把擁有者視窗帶到最上層。
    public static void Activate(IntPtr window) {
        IntPtr foreground = GetForegroundWindow();
        uint current = GetCurrentThreadId(), other = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, IntPtr.Zero);
        bool attached = other != 0 && other != current && AttachThreadInput(current, other, true);
        try { BringWindowToTop(window); SetForegroundWindow(window); }
        finally { if (attached) AttachThreadInput(current, other, false); }
    }

    // 回傳選取的檔案系統路徑；取消回傳 null。
    public static string Pick(IntPtr owner, string title, string initialPath) {
        IFileDialog dialog = (IFileDialog)new FileOpenDialogClass();
        try {
            const uint FOS_NOCHANGEDIR = 0x8, FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40, FOS_PATHMUSTEXIST = 0x800;
            dialog.SetOptions(FOS_NOCHANGEDIR | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
            dialog.SetTitle(title);
            dialog.SetOkButtonLabel("選擇資料夾");
            if (!String.IsNullOrEmpty(initialPath)) {
                IShellItem folder;
                SHCreateItemFromParsingName(initialPath, IntPtr.Zero, typeof(IShellItem).GUID, out folder);
                dialog.SetFolder(folder);
            }
            int hr = dialog.Show(owner);
            if (hr == unchecked((int)0x800704C7)) return null;  // ERROR_CANCELLED
            Marshal.ThrowExceptionForHR(hr);
            IShellItem result;
            dialog.GetResult(out result);
            string path;
            result.GetDisplayName(0x80058000, out path);  // SIGDN_FILESYSPATH
            return path;
        } finally {
            Marshal.ReleaseComObject(dialog);
        }
    }
}
"@
$owner = New-Object System.Windows.Forms.Form
try {
    $owner.ShowInTaskbar = $false
    $owner.TopMost = $true
    $owner.Opacity = 0
    $owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
    $owner.Show()
    [TaskboardFolderDialog]::Activate($owner.Handle)
    $initial = if ($InitialPath -and (Test-Path -LiteralPath $InitialPath -PathType Container)) { $InitialPath } else { '' }
    $selected = [TaskboardFolderDialog]::Pick($owner.Handle, '選擇任務工作資料夾（可在上方網址列直接輸入或貼上路徑）', $initial)
    if ($selected) {
        @{ cancelled = $false; path = $selected } | ConvertTo-Json -Compress
    } else {
        @{ cancelled = $true } | ConvertTo-Json -Compress
    }
} finally {
    $owner.Dispose()
}
