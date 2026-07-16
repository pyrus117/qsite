' Q Youth Site Editor — Windows launcher (no console window)
' Double-click this file to start the editor.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = Replace(WScript.ScriptFullName, WScript.ScriptName, "")
sh.Run "pythonw editor.py", 0, False
