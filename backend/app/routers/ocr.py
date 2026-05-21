"""OCR 识别路由"""
import os
import uuid
from fastapi import APIRouter, UploadFile, File, Depends
from app.config import DATA_DIR
from app.services.ocr_service import recognize_report

router = APIRouter(prefix="/api/ocr", tags=["OCR识别"])

UPLOAD_DIR = os.path.join(DATA_DIR, "ocr_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/recognize")
async def ocr_recognize(file: UploadFile = File(...)):
    """上传检测报告图片，返回识别结果"""
    # Save uploaded file temporarily
    ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    try:
        result = recognize_report(filepath)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        # Clean up temp file
        if os.path.exists(filepath):
            os.unlink(filepath)
