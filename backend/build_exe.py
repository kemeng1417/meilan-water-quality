"""PyInstaller 打包脚本"""
import PyInstaller.__main__
import os
import shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(ROOT)

PyInstaller.__main__.run([
    os.path.join(ROOT, "run.py"),
    "--name=水质管理系统",
    "--onefile",
    "--console",
    "--clean",
    "--noconfirm",
    f"--distpath={PROJECT_ROOT}/dist",
    f"--workpath={PROJECT_ROOT}/build_tmp",
    f"--specpath={PROJECT_ROOT}",
    # 前端静态文件
    f"--add-data={PROJECT_ROOT}/frontend/dist{os.pathsep}frontend/dist",
    # 隐藏导入
    "--hidden-import=sqlalchemy.ext.declarative",
    "--hidden-import=passlib.handlers.bcrypt",
    "--hidden-import=jinja2",
    "--hidden-import=openpyxl",
    "--hidden-import=python-docx",
    "--hidden-import=bcrypt",
    # 收集所有子模块
    "--collect-all=app",
])

print(f"\n打包完成: {PROJECT_ROOT}/dist/水质管理系统.exe")
