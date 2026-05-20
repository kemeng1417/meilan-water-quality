"""启动脚本：初始化数据库并启动服务"""
import sys
import os
import webbrowser
import uvicorn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from seed_data import seed_all

if __name__ == "__main__":
    print("=" * 50)
    print("  美兰机场供水站水质管理系统 v1.0")
    print("=" * 50)

    print("\n[1/2] 初始化数据库...")
    seed_all()

    print("[2/2] 启动服务...")
    print("\n  浏览器访问: http://localhost:8000")
    print("  API 文档:   http://localhost:8000/docs")
    print("\n  按 Ctrl+C 停止服务\n")

    try:
        webbrowser.open("http://localhost:8000")
    except Exception:
        pass

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, log_level="warning")
