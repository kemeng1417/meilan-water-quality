from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import TestDetail, TestRecord, SamplePoint, Indicator

router = APIRouter(prefix="/api/trends", tags=["趋势分析"])


@router.get("/data")
def get_trend_data(
    indicator_ids: str = Query(...),
    sampling_point_ids: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    获取趋势数据
    indicator_ids: 逗号分隔的指标ID
    sampling_point_ids: 逗号分隔的采样点ID（可选，不传=所有）
    """
    ind_ids = [int(x) for x in indicator_ids.split(",")]
    pt_ids = [int(x) for x in sampling_point_ids.split(",")] if sampling_point_ids else None

    q = db.query(
        TestRecord.test_date,
        SamplePoint.name.label("point_name"),
        Indicator.name.label("indicator_name"),
        Indicator.unit,
        TestDetail.value_num,
        TestDetail.value_text,
        TestDetail.is_qualified,
    ).join(TestDetail, TestDetail.record_id == TestRecord.id
    ).join(SamplePoint, SamplePoint.id == TestDetail.sample_point_id
    ).join(Indicator, Indicator.id == TestDetail.indicator_id
    ).filter(TestDetail.indicator_id.in_(ind_ids))

    if pt_ids:
        q = q.filter(TestDetail.sample_point_id.in_(pt_ids))
    if start_date:
        q = q.filter(TestRecord.test_date >= start_date)
    if end_date:
        q = q.filter(TestRecord.test_date <= end_date)

    rows = q.order_by(TestRecord.test_date, SamplePoint.sort_order).all()

    return [
        {
            "test_date": str(r.test_date),
            "point_name": r.point_name,
            "indicator_name": r.indicator_name,
            "unit": r.unit,
            "value_num": r.value_num,
            "value_text": r.value_text,
            "is_qualified": r.is_qualified,
        }
        for r in rows
    ]
