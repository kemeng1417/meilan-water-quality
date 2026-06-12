"""检测记录路由 —— 核心 CRUD + 批量保存 + 合规判定"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TestRecord, TestDetail, SamplePoint, Indicator, WaterType, AlertRecord, Photo
from app.schemas import (
    TestRecordCreate, TestRecordUpdate, TestRecordOut,
    TestDetailOut, TestDetailUpdate,
)
from app.services.compliance import check_compliance, _parse_numeric
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/records", tags=["检测记录"])


def _gen_record_no(db: Session, wt_id: int, test_date: date) -> str:
    wt = db.query(WaterType).filter(WaterType.id == wt_id).first()
    prefix_map = {"finished": "CCS", "tap": "MSS", "direct": "ZYS", "combined": "LH"}
    prefix = prefix_map.get(wt.code, "JC") if wt else "JC"
    date_str = test_date.strftime("%Y%m%d")
    pattern = f"{prefix}-{date_str}-%"
    max_no = db.query(TestRecord).filter(
        TestRecord.record_no.like(pattern),
    ).order_by(TestRecord.record_no.desc()).first()
    if max_no:
        try:
            seq = int(max_no.record_no.rsplit("-", 1)[-1]) + 1
        except ValueError:
            seq = 1
    else:
        seq = 1
    return f"{prefix}-{date_str}-{seq:03d}"


@router.get("")
def list_records(
    water_type_id: int | None = Query(None),
    status: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    keyword: str | None = Query(None),
    is_abnormal: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    q = db.query(TestRecord)
    if water_type_id:
        q = q.filter(TestRecord.water_type_id == water_type_id)
    if status:
        q = q.filter(TestRecord.status == status)
    if start_date:
        q = q.filter(TestRecord.test_date >= start_date)
    if end_date:
        q = q.filter(TestRecord.test_date <= end_date)
    if is_abnormal is not None:
        q = q.filter(TestRecord.is_abnormal == is_abnormal)
    if keyword:
        q = q.filter(
            (TestRecord.record_no.contains(keyword)) |
            (TestRecord.tester.contains(keyword))
        )

    total = q.count()

    # Status counts (respecting current filters except status)
    from sqlalchemy import func as sqlfunc
    count_q = db.query(TestRecord)
    if water_type_id:
        count_q = count_q.filter(TestRecord.water_type_id == water_type_id)
    if start_date:
        count_q = count_q.filter(TestRecord.test_date >= start_date)
    if end_date:
        count_q = count_q.filter(TestRecord.test_date <= end_date)
    if is_abnormal is not None:
        count_q = count_q.filter(TestRecord.is_abnormal == is_abnormal)
    if keyword:
        count_q = count_q.filter(
            (TestRecord.record_no.contains(keyword)) |
            (TestRecord.tester.contains(keyword))
        )
    status_counts = {}
    for s in ['draft', 'submitted', 'reviewed', 'rejected']:
        status_counts[s] = count_q.filter(TestRecord.status == s).count()

    records = q.order_by(TestRecord.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return {
        "total": total, "page": page, "page_size": page_size,
        "status_counts": status_counts,
        "items": records,
    }


@router.post("", response_model=TestRecordOut)
def create_record(req: TestRecordCreate, db: Session = Depends(get_db)):
    report_date = req.report_date or date.today()
    record = TestRecord(
        record_no=_gen_record_no(db, req.water_type_id, req.test_date),
        water_type_id=req.water_type_id,
        test_date=req.test_date,
        report_date=report_date,
        tester=req.tester,
        status="draft",
    )
    db.add(record)
    db.flush()

    # 加载采样点（限制在当前水样类型内，防止前端传入跨类型ID）
    if req.point_ids:
        filters = [SamplePoint.id.in_(req.point_ids), SamplePoint.is_active == True]
        if req.water_type_id == 4:
            filters.append(SamplePoint.water_type_id.in_([1, 2]))
        else:
            filters.append(SamplePoint.water_type_id == req.water_type_id)
        points = db.query(SamplePoint).filter(*filters).all()
        if not points:
            raise HTTPException(status_code=400, detail="所选采样点不属于当前水样类型，请重新选择")
    elif req.water_type_id == 4:
        points = db.query(SamplePoint).filter(
            SamplePoint.water_type_id.in_([1, 2]),
            SamplePoint.is_active == True,
        ).all()
    else:
        points = db.query(SamplePoint).filter(
            SamplePoint.water_type_id == req.water_type_id,
            SamplePoint.is_active == True,
        ).all()

    indicators = db.query(Indicator).order_by(Indicator.display_order).all()

    for pt in points:
        for ind in indicators:
            db.add(TestDetail(
                record_id=record.id,
                sample_point_id=pt.id,
                indicator_id=ind.id,
            ))

    db.commit()
    db.refresh(record)
    return record


@router.get("/{record_id}", response_model=TestRecordOut)
def get_record(record_id: int, db: Session = Depends(get_db)):
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


@router.put("/{record_id}", response_model=TestRecordOut)
def update_record(record_id: int, req: TestRecordUpdate, db: Session = Depends(get_db)):
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="仅草稿或已打回状态可修改")

    update_data = req.model_dump(exclude_none=True)
    for k, v in update_data.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@router.get("/{record_id}/details")
def get_details(record_id: int, db: Session = Depends(get_db)):
    details = db.query(TestDetail).filter(TestDetail.record_id == record_id).all()
    # 返回带补充信息的结果
    points = {p.id: p for p in db.query(SamplePoint).all()}
    indicators = {i.id: i for i in db.query(Indicator).all()}

    result = []
    for d in details:
        pt = points.get(d.sample_point_id)
        ind = indicators.get(d.indicator_id)
        result.append({
            "id": d.id,
            "record_id": d.record_id,
            "sample_point_id": d.sample_point_id,
            "sample_point_name": pt.name if pt else "",
            "sample_point_code": pt.code if pt else "",
            "sample_point_area": pt.area if pt else "",
            "indicator_id": d.indicator_id,
            "indicator_name": ind.name if ind else "",
            "indicator_unit": ind.unit if ind else "",
            "indicator_type": ind.value_type if ind else "numeric",
            "value_text": d.value_text,
            "value_num": d.value_num,
            "is_qualified": d.is_qualified,
            "is_abnormal": d.is_abnormal,
            "notes": d.notes,
        })
    return result


@router.put("/{record_id}/details")
def batch_save_details(record_id: int, items: list[TestDetailUpdate], db: Session = Depends(get_db)):
    """批量保存检测明细，并执行合规判定"""
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="仅草稿或已打回状态可修改")

    has_abnormal = False

    for item in items:
        detail = db.query(TestDetail).filter(
            TestDetail.record_id == record_id,
            TestDetail.sample_point_id == item.sample_point_id,
            TestDetail.indicator_id == item.indicator_id,
        ).first()

        if not detail:
            continue

        detail.value_text = item.value_text
        detail.notes = item.notes

        detail.value_num = _parse_numeric(item.value_text) if item.value_text else None

        # 合规判定
        result = check_compliance(
            db, detail.sample_point_id, detail.indicator_id,
            detail.value_text, detail.value_num,
        )
        detail.is_qualified = result["is_qualified"]
        detail.is_abnormal = result["is_abnormal"]

        if result["is_abnormal"]:
            has_abnormal = True

    record.is_abnormal = has_abnormal
    db.flush()  # 确保 is_abnormal 等修改已同步到数据库再查询

    # ── 始终自动生成最新结论（前端通过 conclusionEdited 控制是否采纳）──
    water_type = db.query(WaterType).filter(WaterType.id == record.water_type_id).first()
    std = water_type.standard_code if water_type else "相关标准"
    total_cells = db.query(TestDetail).filter(TestDetail.record_id == record_id).count()
    filled_cells = db.query(TestDetail).filter(
        TestDetail.record_id == record_id,
        TestDetail.value_text.isnot(None),
        TestDetail.value_text != '',
    ).count()
    empty_cells = total_cells - filled_cells

    if has_abnormal:
        abnormal_details = db.query(TestDetail).filter(TestDetail.record_id == record_id, TestDetail.is_abnormal == True).all()
        pt_ids = list(set(d.sample_point_id for d in abnormal_details))
        ind_ids = list(set(d.indicator_id for d in abnormal_details))
        pt_names = [p.name for p in db.query(SamplePoint).filter(SamplePoint.id.in_(pt_ids)).all()]
        ind_names = [i.name for i in db.query(Indicator).filter(Indicator.id.in_(ind_ids)).all()]
        record.conclusion = f"本次检测发现 {len(abnormal_details)} 项超标，涉及 {len(pt_ids)} 个采样点（{'、'.join(pt_names[:5])}{'等' if len(pt_ids) > 5 else ''}）。超标指标：{'、'.join(ind_names)}。不符合{std}标准要求，需整改。"
    elif empty_cells > 0:
        record.conclusion = f"已检项目均符合{std}标准要求，尚有 {empty_cells} 项未填报。"
    else:
        record.conclusion = f"本次检测项目全部合格，符合{std}标准要求。"

    db.commit()
    return {"success": True, "has_abnormal": has_abnormal, "conclusion": record.conclusion}


@router.put("/{record_id}/review")
def review_record(record_id: int, reviewer: str = Query(...), conclusion: str | None = Query(None), db: Session = Depends(get_db)):
    """审核通过，并自动为超标项创建告警记录"""
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.status not in ("submitted", "rejected"):
        raise HTTPException(status_code=400, detail="仅待审核或已打回状态可审核通过")
    record.status = "reviewed"
    record.reviewer = reviewer
    record.rejection_reason = None
    if conclusion:
        record.conclusion = conclusion

    # 审核通过后，为所有超标明细创建告警（避免重复）
    abnormal_details = db.query(TestDetail).filter(
        TestDetail.record_id == record_id,
        TestDetail.is_abnormal == True,
    ).all()
    for detail in abnormal_details:
        existing_alert = db.query(AlertRecord).filter(
            AlertRecord.test_detail_id == detail.id,
            AlertRecord.resolved == False,
        ).first()
        if not existing_alert:
            # 构建告警描述
            from app.services.compliance import check_compliance
            result = check_compliance(
                db, detail.sample_point_id, detail.indicator_id,
                detail.value_text, detail.value_num,
            )
            db.add(AlertRecord(
                test_detail_id=detail.id,
                record_id=record_id,
                alert_type="exceed_limit",
                description=result["alert_desc"],
                resolved=False,
            ))

    db.commit()
    return {"success": True}


@router.put("/{record_id}/reject")
def reject_record(record_id: int, reviewer: str = Query(...), reason: str = Query(...), db: Session = Depends(get_db)):
    """打回记录（审核不通过），同时清除该记录已生成的告警"""
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.status not in ("submitted",):
        raise HTTPException(status_code=400, detail="仅待审核状态的记录可打回")
    record.status = "rejected"
    record.reviewer = reviewer
    record.rejection_reason = reason
    # 打回时清除该记录所有未解决的告警（修正数据后重新审核时会重新生成）
    db.query(AlertRecord).filter(
        AlertRecord.record_id == record_id,
        AlertRecord.resolved == False,
    ).delete()
    db.commit()
    return {"success": True}


@router.get("/latest-data")
def get_latest_data(water_type_id: int = Query(...), db: Session = Depends(get_db)):
    """获取最近一条同类型记录的检测数据，用于快速复制"""
    record = db.query(TestRecord).filter(
        TestRecord.water_type_id == water_type_id,
    ).order_by(TestRecord.test_date.desc()).first()
    if not record:
        return {"found": False}

    details = db.query(TestDetail).filter(TestDetail.record_id == record.id).all()
    return {
        "found": True,
        "record_no": record.record_no,
        "test_date": str(record.test_date),
        "items": [
            {
                "sample_point_id": d.sample_point_id,
                "indicator_id": d.indicator_id,
                "value_text": d.value_text,
            }
            for d in details if d.value_text
        ],
    }


@router.delete("/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db),
                  authorization: str | None = Header(None)):
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    # 检查是否为管理员（管理员可删除已审核记录）
    is_admin = False
    if authorization:
        parts = authorization.split()
        token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else None
        if token:
            user = get_current_user(db, token)
            is_admin = user is not None and user.role == "admin"
    if record.status == "reviewed" and not is_admin:
        raise HTTPException(status_code=400, detail="已审核记录不可删除，需要管理员权限")
    db.query(AlertRecord).filter(AlertRecord.record_id == record_id).delete()
    db.query(Photo).filter(Photo.record_id == record_id).delete()
    db.query(TestDetail).filter(TestDetail.record_id == record_id).delete()
    db.delete(record)
    db.commit()
    return {"success": True}


@router.post("/batch-delete")
def batch_delete_records(ids: list[int], db: Session = Depends(get_db),
                         authorization: str | None = Header(None)):
    """批量删除记录，跳过已审核的（管理员除外），只删除草稿/已打回"""
    # 检查是否为管理员
    is_admin = False
    if authorization:
        parts = authorization.split()
        token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else None
        if token:
            user = get_current_user(db, token)
            is_admin = user is not None and user.role == "admin"
    records = db.query(TestRecord).filter(TestRecord.id.in_(ids)).all()
    skipped = []
    deleted = 0
    for r in records:
        if r.status == "reviewed" and not is_admin:
            skipped.append(r.record_no)
            continue
        db.query(AlertRecord).filter(AlertRecord.record_id == r.id).delete()
        db.query(Photo).filter(Photo.record_id == r.id).delete()
        db.query(TestDetail).filter(TestDetail.record_id == r.id).delete()
        db.delete(r)
        deleted += 1
    db.commit()
    return {"success": True, "deleted": deleted, "skipped": skipped}


@router.delete("/{record_id}/points/{sample_point_id}")
def remove_point_from_record(record_id: int, sample_point_id: int, db: Session = Depends(get_db)):
    """从记录中移除一个采样点及其全部明细"""
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="仅草稿或已打回状态可修改")
    # 先删除关联的告警记录（外键依赖）
    detail_ids = db.query(TestDetail.id).filter(
        TestDetail.record_id == record_id,
        TestDetail.sample_point_id == sample_point_id,
    ).all()
    dids = [d[0] for d in detail_ids]
    if dids:
        db.query(AlertRecord).filter(AlertRecord.test_detail_id.in_(dids)).delete()
    # 删除明细
    deleted = db.query(TestDetail).filter(
        TestDetail.record_id == record_id,
        TestDetail.sample_point_id == sample_point_id,
    ).delete()
    # 删除关联照片
    db.query(Photo).filter(
        Photo.record_id == record_id,
        Photo.sample_point_id == sample_point_id,
    ).delete()
    db.commit()
    return {"success": True, "deleted": deleted}


@router.post("/{record_id}/points")
def add_point_to_record(record_id: int, sample_point_id: int = Query(...), db: Session = Depends(get_db)):
    """向记录中添加一个采样点（含全部指标明细）"""
    record = db.query(TestRecord).filter(TestRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="记录不存在")
    if record.status not in ("draft", "rejected"):
        raise HTTPException(status_code=400, detail="仅草稿或已打回状态可修改")

    point = db.query(SamplePoint).filter(SamplePoint.id == sample_point_id, SamplePoint.is_active == True).first()
    if not point:
        raise HTTPException(status_code=404, detail="采样点不存在或已停用")

    existing = db.query(TestDetail).filter(
        TestDetail.record_id == record_id,
        TestDetail.sample_point_id == sample_point_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="该采样点已存在于本记录中")

    indicators = db.query(Indicator).order_by(Indicator.display_order).all()
    for ind in indicators:
        db.add(TestDetail(
            record_id=record_id,
            sample_point_id=sample_point_id,
            indicator_id=ind.id,
        ))

    db.commit()
    return {"success": True, "sample_point_name": point.name, "sample_point_area": point.area or "", "sample_point_code": point.code or ""}


@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    from datetime import date as dt_date, timedelta
    from sqlalchemy import func as sqlfunc

    today = dt_date.today()
    this_month_start = today.replace(day=1)

    # ── 基础统计 ──
    today_records = db.query(TestRecord).filter(TestRecord.test_date == today).count()
    month_records = db.query(TestRecord).filter(TestRecord.test_date >= this_month_start).count()
    abnormal_count = db.query(TestRecord).filter(
        TestRecord.is_abnormal == True,
        TestRecord.test_date >= this_month_start,
    ).count()
    pending_review = db.query(TestRecord).filter(
        TestRecord.test_date >= this_month_start,
        TestRecord.status == "submitted",
    ).count()

    # 合格率
    total_details = db.query(TestDetail).join(TestRecord).filter(
        TestRecord.test_date >= this_month_start,
        TestDetail.is_qualified.isnot(None),
    ).count()
    qualified_details = db.query(TestDetail).join(TestRecord).filter(
        TestRecord.test_date >= this_month_start,
        TestDetail.is_qualified == True,
    ).count()
    rate = round(qualified_details / total_details * 100, 1) if total_details > 0 else 100.0

    # ── 各水样类型统计 ──
    wt_stats = []
    for wt in db.query(WaterType).all():
        wt_recs = db.query(TestRecord).filter(
            TestRecord.water_type_id == wt.id,
            TestRecord.test_date >= this_month_start,
        )
        wt_total = wt_recs.count()
        wt_abnormal = wt_recs.filter(TestRecord.is_abnormal == True).count()

        wt_dets = db.query(TestDetail).join(TestRecord).filter(
            TestRecord.water_type_id == wt.id,
            TestRecord.test_date >= this_month_start,
            TestDetail.is_qualified.isnot(None),
        )
        wt_total_dets = wt_dets.count()
        wt_ok_dets = wt_dets.filter(TestDetail.is_qualified == True).count()
        wt_rate = round(wt_ok_dets / wt_total_dets * 100, 1) if wt_total_dets > 0 else 100.0

        wt_stats.append({
            "water_type_id": wt.id,
            "water_type_name": wt.name,
            "total": wt_total,
            "abnormal": wt_abnormal,
            "qualification_rate": wt_rate,
        })

    # ── 近 7 天合格率趋势 ──
    weekly_trend = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        dets = db.query(TestDetail).join(TestRecord).filter(
            TestRecord.test_date == d,
            TestDetail.is_qualified.isnot(None),
        )
        total_d = dets.count()
        ok_d = dets.filter(TestDetail.is_qualified == True).count()
        rec_count = db.query(TestRecord).filter(TestRecord.test_date == d).count()
        ab_count = db.query(TestRecord).filter(
            TestRecord.test_date == d, TestRecord.is_abnormal == True
        ).count()
        weekly_trend.append({
            "date": str(d),
            "qualification_rate": round(ok_d / total_d * 100, 1) if total_d > 0 else None,
            "total": rec_count,
            "abnormal": ab_count,
        })

    # ── 本月超标指标排行 ──
    top_failed = []
    failed_query = db.query(
        Indicator.name, sqlfunc.count(TestDetail.id).label("cnt")
    ).join(TestDetail, TestDetail.indicator_id == Indicator.id
    ).join(TestRecord, TestRecord.id == TestDetail.record_id
    ).filter(
        TestRecord.test_date >= this_month_start,
        TestDetail.is_abnormal == True,
    ).group_by(Indicator.name).order_by(sqlfunc.count(TestDetail.id).desc()).limit(5).all()
    for name, cnt in failed_query:
        top_failed.append({"indicator_name": name, "count": cnt})

    # ── 本月检测日历 ──
    test_dates = db.query(TestRecord.test_date).filter(
        TestRecord.test_date >= this_month_start,
    ).distinct().all()
    calendar_dates = [str(row[0]) for row in test_dates]

    # ── 今日完成情况 ──
    today_detail = []
    for wt in db.query(WaterType).all():
        rec = db.query(TestRecord).filter(
            TestRecord.water_type_id == wt.id,
            TestRecord.test_date == today,
        ).first()
        if rec:
            filled = db.query(TestDetail).filter(
                TestDetail.record_id == rec.id,
                TestDetail.value_text.isnot(None),
                TestDetail.value_text != '',
            ).count()
            total_cells = db.query(TestDetail).filter(
                TestDetail.record_id == rec.id,
            ).count()
            rate_pct = round(filled / total_cells * 100, 1) if total_cells > 0 else 0
            today_detail.append({
                "water_type_name": wt.name,
                "record_id": rec.id,
                "record_no": rec.record_no,
                "status": rec.status,
                "fill_rate": rate_pct,
                "has_abnormal": rec.is_abnormal,
            })
        else:
            today_detail.append({
                "water_type_name": wt.name,
                "record_id": None,
                "record_no": None,
                "status": "none",
                "fill_rate": 0,
                "has_abnormal": False,
            })

    return {
        "today_records": today_records,
        "this_month_records": month_records,
        "abnormal_count": abnormal_count,
        "pending_review": pending_review,
        "qualification_rate": rate,
        "water_type_stats": wt_stats,
        "weekly_trend": weekly_trend,
        "top_failed": top_failed,
        "calendar_dates": calendar_dates,
        "today_detail": today_detail,
    }
