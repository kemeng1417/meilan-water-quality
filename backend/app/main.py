from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import FRONTEND_DIR
from app.database import engine, Base
from app.routers import auth, indicators, records, alerts, trends, export, photos, ocr


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from seed_data import seed_all
    seed_all()
    yield


app = FastAPI(title="美兰机场供水站水质管理系统", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(indicators.router)
app.include_router(records.router)
app.include_router(alerts.router)
app.include_router(trends.router)
app.include_router(export.router)
app.include_router(photos.router)
app.include_router(ocr.router)

frontend_dist = Path(FRONTEND_DIR) if FRONTEND_DIR else None

if frontend_dist and frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = frontend_dist / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(frontend_dist / "index.html"))


@app.get("/")
async def root():
    if frontend_dist and frontend_dist.exists():
        return FileResponse(str(frontend_dist / "index.html"))
    return {"message": "水质管理系统 API", "docs": "/docs"}

