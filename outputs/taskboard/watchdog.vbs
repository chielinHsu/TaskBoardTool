Option Explicit
Dim taskboardShell, taskboardFS, taskboardRoot, taskboardCommand
Set taskboardShell = CreateObject("WScript.Shell")
Set taskboardFS = CreateObject("Scripting.FileSystemObject")
taskboardRoot = taskboardFS.GetParentFolderName(WScript.ScriptFullName)
taskboardCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & taskboardRoot & "\watchdog.ps1"""
taskboardShell.Run taskboardCommand, 0, False
