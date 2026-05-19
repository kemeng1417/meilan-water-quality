import os
import sys


def _get_base_dir():
    """获取项目根目录（兼容 PyInstaller 打包和开发模式）"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        # config.py → app/ → backend/ → project root
        return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


BASE_DIR = _get_base_dir()
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "water_quality.db")

FRONTEND_DIR = os.path.join(BASE_DIR, "frontend", "dist")
if getattr(sys, 'frozen', False):
    # PyInstaller 模式下前端文件在 _MEIPASS
    FRONTEND_DIR = os.path.join(sys._MEIPASS, "frontend", "dist")

SECRET_KEY = "meilan-airport-water-2026-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

os.makedirs(DATA_DIR, exist_ok=True)
