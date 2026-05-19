import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import DATA_DIR
from app.database import get_db
from app.models import Photo, TestRecord, SamplePoint

PHOTOS_DIR = os.path.join(DATA_DIR, "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)

router = APIRouter(prefix="/api/photos", tags=["照片"])


@router.post("/upload")
def upload_photo(
    record_id: int = Query(...),
    sample_point_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # 验证记录和点位存在
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")

    # 生成唯一文件名
    ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"

    # 保存文件
    filepath = os.path.join(PHOTOS_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(file.file.read())

    # 记录到数据库
    photo = Photo(
        record_id=record_id,
        sample_point_id=sample_point_id,
        filename=filename,
        original_name=file.filename or filename,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    return {
        "id": photo.id,
        "filename": filename,
        "original_name": photo.original_name,
        "url": f"/api/photos/{photo.id}/file",
    }


@router.get("")
def list_photos(
    record_id: int = Query(...),
    sample_point_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Photo).filter(Photo.record_id == record_id)
    if sample_point_id:
        q = q.filter(Photo.sample_point_id == sample_point_id)
    photos = q.order_by(Photo.created_at.desc()).all()
    return [
        {
            "id": p.id,
            "sample_point_id": p.sample_point_id,
            "original_name": p.original_name,
            "url": f"/api/photos/{p.id}/file",
            "created_at": str(p.created_at),
        }
        for p in photos
    ]


@router.get("/{photo_id}/file")
def get_photo_file(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")

    filepath = os.path.join(PHOTOS_DIR, photo.filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="文件丢失")

    return FileResponse(filepath, media_type="image/jpeg")


@router.delete("/{photo_id}")
def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")

    filepath = os.path.join(PHOTOS_DIR, photo.filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    db.delete(photo)
    db.commit()
    return {"success": True}
