Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
' Get the directory where this VBS file is located
CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = CurrentDirectory
' Launch the exe with hidden window
WshShell.Run """" & CurrentDirectory & "\水质管理系统.exe" & """", 0, False
Set WshShell = Nothing
Set fso = Nothing
