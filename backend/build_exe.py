"""PyInstaller 打包脚本"""
import PyInstaller.__main__
import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(ROOT)
DIST_DIR = os.path.join(PROJECT_ROOT, "dist")

# ===== 1. 打包 exe =====
print("[1/3] Building exe...")
PyInstaller.__main__.run([
    os.path.join(ROOT, "run.py"),
    "--name=水质管理系统",
    "--onefile",
    "--console",
    "--clean",
    "--noconfirm",
    f"--distpath={DIST_DIR}",
    f"--workpath={PROJECT_ROOT}/build_tmp",
    f"--specpath={PROJECT_ROOT}",
    f"--add-data={PROJECT_ROOT}/frontend/dist{os.pathsep}frontend/dist",
    "--hidden-import=sqlalchemy.ext.declarative",
    "--hidden-import=bcrypt",
    "--hidden-import=jinja2",
    "--hidden-import=openpyxl",
    "--hidden-import=python-docx",
    "--hidden-import=docx",
    "--hidden-import=win32com",
    "--hidden-import=win32com.client",
    "--collect-all=app",
])

print(f"[1/3] Done: {DIST_DIR}/水质管理系统.exe")

# ===== 2. 拷贝数据库 =====
print("[2/3] Copying database...")
dist_data = os.path.join(DIST_DIR, "data")
os.makedirs(dist_data, exist_ok=True)

src_db = os.path.join(PROJECT_ROOT, "data", "water_quality.db")
if os.path.exists(src_db):
    # 先 checkpoint
    import sqlite3
    db = sqlite3.connect(src_db)
    db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()
    shutil.copy2(src_db, os.path.join(dist_data, "water_quality.db"))
    print(f"  DB copied: {os.path.getsize(src_db)} bytes")
else:
    print("  WARNING: source DB not found, will auto-init on first run")

# ===== 3. 生成启动脚本 =====
print("[3/3] Creating launcher...")
vbs_path = os.path.join(DIST_DIR, "启动水质管理系统.vbs")
vbs_content = '''Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
curDir = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = curDir & "\\水质管理系统.exe"
WshShell.Run """" & exePath & """", 7, False
'''
with open(vbs_path, "w", encoding="utf-8") as f:
    f.write(vbs_content)
print(f"  VBS: {vbs_path}")

# 快捷方式
try:
    import pythoncom
    from win32com.client import Dispatch
    pythoncom.CoInitialize()
    shell = Dispatch("WScript.Shell")
    shortcut_path = os.path.join(DIST_DIR, "水质管理系统.lnk")
    shortcut = shell.CreateShortcut(shortcut_path)
    shortcut.TargetPath = vbs_path
    shortcut.WorkingDirectory = DIST_DIR
    shortcut.WindowStyle = 7
    shortcut.Description = "美兰机场供水站水质管理系统"
    shortcut.Save()
    pythoncom.CoUninitialize()
    print(f"  Shortcut: {shortcut_path}")
except Exception as e:
    print(f"  Shortcut skipped: {e}")

print(f"\n{'=' * 50}")
print(f"Build complete!")
print(f"  Output: {DIST_DIR}")
print(f"  EXE: 水质管理系统.exe")
print(f"  Launch: 启动水质管理系统.vbs")
print(f"{'=' * 50}")
