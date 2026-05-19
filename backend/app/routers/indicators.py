from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import WaterType, Indicator, StandardLimit, SamplePoint
from app.schemas import SamplePointCreate

router = APIRouter(prefix="/api", tags=["基础数据"])


def _resolve_limit_wt_id(water_type_id: int) -> int:
    """联合报告(4)复用出厂水(1)的指标和限值"""
    return 1 if water_type_id == 4 else water_type_id


@router.get("/water-types")
def list_water_types(db: Session = Depends(get_db)):
    return db.query(WaterType).all()


@router.get("/indicators")
def list_indicators(water_type_id: int | None = Query(None), db: Session = Depends(get_db)):
    """获取检测指标，可选按水样类型过滤（返回该类型有限值的指标）"""
    q = db.query(Indicator)
    if water_type_id:
        lookup_id = _resolve_limit_wt_id(water_type_id)
        sub = select(StandardLimit.indicator_id).where(
            StandardLimit.water_type_id == lookup_id
        ).scalar_subquery()
        q = q.filter(Indicator.id.in_(sub))
    return q.order_by(Indicator.display_order).all()


@router.get("/limits")
def list_limits(water_type_id: int = Query(...), db: Session = Depends(get_db)):
    lookup_id = _resolve_limit_wt_id(water_type_id)
    return db.query(StandardLimit).filter(
        StandardLimit.water_type_id == lookup_id
    ).all()


@router.get("/sample-points")
def list_sample_points(
    water_type_id: int | None = Query(None),
    active_only: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(SamplePoint)
    if water_type_id:
        if water_type_id == 4:
            q = q.filter(SamplePoint.water_type_id.in_([1, 2]))
        else:
            q = q.filter(SamplePoint.water_type_id == water_type_id)
    if active_only is not None:
        q = q.filter(SamplePoint.is_active == active_only)
    return q.order_by(SamplePoint.area, SamplePoint.sort_order).all()


@router.post("/sample-points")
def create_sample_point(req: SamplePointCreate, db: Session = Depends(get_db)):
    pt = SamplePoint(**req.model_dump())
    db.add(pt)
    db.commit()
    db.refresh(pt)
    return pt


@router.put("/sample-points/{point_id}")
def update_sample_point(point_id: int, req: SamplePointCreate, db: Session = Depends(get_db)):
    pt = db.query(SamplePoint).filter(SamplePoint.id == point_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="采样点不存在")
    for k, v in req.model_dump(exclude_none=True).items():
        setattr(pt, k, v)
    db.commit()
    return pt


@router.delete("/sample-points/{point_id}")
def delete_sample_point(point_id: int, db: Session = Depends(get_db)):
    pt = db.query(SamplePoint).filter(SamplePoint.id == point_id).first()
    if not pt:
        raise HTTPException(status_code=404, detail="采样点不存在")
    # 软删除：标记为停用
    pt.is_active = False
    db.commit()
    return {"success": True}
