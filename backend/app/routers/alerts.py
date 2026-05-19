from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AlertRecord, TestDetail, TestRecord, SamplePoint, Indicator
from app.schemas import AlertUpdate

router = APIRouter(prefix="/api/alerts", tags=["异常告警"])


@router.get("")
def list_alerts(
    status: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(AlertRecord)
    if status == "open":
        q = q.filter(AlertRecord.resolved == False)
    elif status == "resolved":
        q = q.filter(AlertRecord.resolved == True)
    if start_date:
        q = q.filter(AlertRecord.created_at >= start_date)
    if end_date:
        q = q.filter(AlertRecord.created_at <= end_date)

    total = q.count()
    alerts = q.order_by(AlertRecord.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    # 补充关联信息
    items = []
    for a in alerts:
        detail = db.query(TestDetail).filter(TestDetail.id == a.test_detail_id).first()
        record = db.query(TestRecord).filter(TestRecord.id == a.record_id).first()
        pt = db.query(SamplePoint).filter(SamplePoint.id == detail.sample_point_id).first() if detail else None
        ind = db.query(Indicator).filter(Indicator.id == detail.indicator_id).first() if detail else None
        items.append({
            "id": a.id,
            "test_detail_id": a.test_detail_id,
            "record_id": a.record_id,
            "record_no": record.record_no if record else "",
            "test_date": str(record.test_date) if record else "",
            "sample_point_name": pt.name if pt else "",
            "indicator_name": ind.name if ind else "",
            "value_text": detail.value_text if detail else "",
            "alert_type": a.alert_type,
            "description": a.description,
            "corrective_action": a.corrective_action,
            "resolved": a.resolved,
            "resolved_at": str(a.resolved_at) if a.resolved_at else None,
            "created_at": str(a.created_at),
        })

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.put("/{alert_id}")
def update_alert(alert_id: int, req: AlertUpdate, db: Session = Depends(get_db)):
    alert = db.query(AlertRecord).filter(AlertRecord.id == alert_id).first()
    if not alert:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="告警不存在")

    update_data = req.model_dump(exclude_none=True)
    for k, v in update_data.items():
        setattr(alert, k, v)

    if req.resolved and not alert.resolved_at:
        from datetime import datetime
        alert.resolved_at = datetime.utcnow()

    db.commit()
    return {"success": True}
