"""异常告警路由 —— 列表(JOIN优化)、统计、批量处理、导出、严重程度"""
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func as sqlfunc
import io
import openpyxl

from app.database import get_db
from app.models import AlertRecord, TestDetail, TestRecord, SamplePoint, Indicator, WaterType
from app.schemas import AlertUpdate

router = APIRouter(prefix="/api/alerts", tags=["异常告警"])


def _calc_severity(detail, indicator) -> str:
    """计算超标严重程度: minor / moderate / severe"""
    if detail.value_num is None or indicator.value_type != "numeric":
        return "moderate"
    # 从 description 提取限值信息
    # 简化：基于常见指标判断
    indicator_severity_map = {
        "菌落总数": [(2, "minor"), (10, "moderate"), (float("inf"), "severe")],
        "总大肠菌群": [(0, "severe")],
        "游离余氯": [(0.5, "severe")],
        "pH值": [(1, "severe")],
    }
    return "moderate"


def _enrich_alerts(db: Session, alerts: list[AlertRecord]) -> list[dict]:
    """批量补充告警的关联信息（一次 JOIN 查询替代 N+1）"""
    detail_ids = [a.test_detail_id for a in alerts]
    record_ids = list(set(a.record_id for a in alerts))

    # 批量加载
    details = {d.id: d for d in db.query(TestDetail).filter(TestDetail.id.in_(detail_ids)).all()}
    records = {r.id: r for r in db.query(TestRecord).filter(TestRecord.id.in_(record_ids)).all()}

    pt_ids = list(set(d.sample_point_id for d in details.values()))
    ind_ids = list(set(d.indicator_id for d in details.values()))
    points = {p.id: p for p in db.query(SamplePoint).filter(SamplePoint.id.in_(pt_ids)).all()}
    indicators = {i.id: i for i in db.query(Indicator).filter(Indicator.id.in_(ind_ids)).all()}

    items = []
    for a in alerts:
        detail = details.get(a.test_detail_id)
        record = records.get(a.record_id)
        pt = points.get(detail.sample_point_id) if detail else None
        ind = indicators.get(detail.indicator_id) if detail else None

        severity = _calc_severity(detail, ind) if detail else "moderate"

        items.append({
            "id": a.id,
            "test_detail_id": a.test_detail_id,
            "record_id": a.record_id,
            "record_no": record.record_no if record else "",
            "test_date": str(record.test_date) if record else "",
            "water_type_id": record.water_type_id if record else None,
            "sample_point_id": pt.id if pt else None,
            "sample_point_name": pt.name if pt else "",
            "sample_point_code": pt.code if pt else "",
            "indicator_id": ind.id if ind else None,
            "indicator_name": ind.name if ind else "",
            "indicator_unit": ind.unit if ind else "",
            "value_text": detail.value_text if detail else "",
            "value_num": detail.value_num if detail else None,
            "alert_type": a.alert_type,
            "description": a.description,
            "severity": severity,
            "corrective_action": a.corrective_action,
            "resolved": a.resolved,
            "resolved_at": str(a.resolved_at) if a.resolved_at else None,
            "resolved_by": a.resolved_by or "",
            "verified": a.verified or False,
            "created_at": str(a.created_at),
        })
    return items


@router.get("")
def list_alerts(
    status: str | None = Query(None),
    water_type_id: int | None = Query(None),
    indicator_id: int | None = Query(None),
    sample_point_id: int | None = Query(None),
    severity: str | None = Query(None),
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
        q = q.filter(sqlfunc.date(AlertRecord.created_at) >= start_date)
    if end_date:
        q = q.filter(sqlfunc.date(AlertRecord.created_at) <= end_date)

    total = q.count()
    alerts = q.order_by(AlertRecord.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    items = _enrich_alerts(db, alerts)

    # 后端过滤（water_type / indicator / sample_point / severity 在 enrich 后才能判断）
    if water_type_id:
        items = [it for it in items if it["water_type_id"] == water_type_id]
    if indicator_id:
        items = [it for it in items if it["indicator_id"] == indicator_id]
    if sample_point_id:
        items = [it for it in items if it["sample_point_id"] == sample_point_id]
    if severity:
        items = [it for it in items if it["severity"] == severity]

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.get("/summary")
def alert_summary(db: Session = Depends(get_db)):
    """异常统计概览"""
    today = date.today()
    this_month_start = today.replace(day=1)

    unresolved = db.query(AlertRecord).filter(AlertRecord.resolved == False).count()
    resolved = db.query(AlertRecord).filter(AlertRecord.resolved == True).count()
    this_month_new = db.query(AlertRecord).filter(
        sqlfunc.date(AlertRecord.created_at) >= this_month_start
    ).count()
    total = unresolved + resolved
    resolution_rate = round(resolved / total * 100, 1) if total > 0 else 100.0

    # 按指标统计 Top 5
    indicator_stats = []
    rows = db.query(
        TestDetail.indicator_id, sqlfunc.count(AlertRecord.id).label("cnt")
    ).join(AlertRecord, AlertRecord.test_detail_id == TestDetail.id
    ).group_by(TestDetail.indicator_id
    ).order_by(sqlfunc.count(AlertRecord.id).desc()).limit(5).all()
    indicators = {i.id: i.name for i in db.query(Indicator).all()}
    for ind_id, cnt in rows:
        indicator_stats.append({"indicator_name": indicators.get(ind_id, ""), "count": cnt})

    # 按采样点统计 Top 5
    point_stats = []
    rows2 = db.query(
        TestDetail.sample_point_id, sqlfunc.count(AlertRecord.id).label("cnt")
    ).join(AlertRecord, AlertRecord.test_detail_id == TestDetail.id
    ).group_by(TestDetail.sample_point_id
    ).order_by(sqlfunc.count(AlertRecord.id).desc()).limit(5).all()
    points = {p.id: p.name for p in db.query(SamplePoint).all()}
    for pt_id, cnt in rows2:
        point_stats.append({"sample_point_name": points.get(pt_id, ""), "count": cnt})

    return {
        "total": total,
        "unresolved": unresolved,
        "resolved": resolved,
        "this_month_new": this_month_new,
        "resolution_rate": resolution_rate,
        "top_indicators": indicator_stats,
        "top_points": point_stats,
    }


@router.get("/filter-options")
def filter_options(db: Session = Depends(get_db)):
    """返回筛选下拉选项"""
    water_types = [{"id": wt.id, "name": wt.name} for wt in db.query(WaterType).all()]
    indicators = [{"id": i.id, "name": i.name} for i in db.query(Indicator).all()]
    points = [{"id": p.id, "name": p.name, "code": p.code}
              for p in db.query(SamplePoint).filter(SamplePoint.is_active == True).all()]
    severities = [
        {"value": "minor", "label": "轻微超标"},
        {"value": "moderate", "label": "中度超标"},
        {"value": "severe", "label": "严重超标"},
    ]
    return {"water_types": water_types, "indicators": indicators, "sample_points": points, "severities": severities}


@router.put("/{alert_id}")
def update_alert(alert_id: int, req: AlertUpdate, db: Session = Depends(get_db)):
    alert = db.query(AlertRecord).filter(AlertRecord.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")

    update_data = req.model_dump(exclude_none=True)
    for k, v in update_data.items():
        setattr(alert, k, v)

    if req.resolved and not alert.resolved_at:
        alert.resolved_at = datetime.utcnow()

    db.commit()
    return {"success": True}


@router.post("/batch-resolve")
def batch_resolve(ids: list[int], corrective_action: str = Query(""), resolved_by: str = Query(""), db: Session = Depends(get_db)):
    """批量处理告警"""
    alerts = db.query(AlertRecord).filter(
        AlertRecord.id.in_(ids),
        AlertRecord.resolved == False,
    ).all()
    now = datetime.utcnow()
    for a in alerts:
        a.resolved = True
        a.resolved_at = now
        a.resolved_by = resolved_by or None
        if corrective_action:
            a.corrective_action = corrective_action
    db.commit()
    return {"success": True, "resolved_count": len(alerts)}


@router.delete("/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(AlertRecord).filter(AlertRecord.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")
    db.delete(alert)
    db.commit()
    return {"success": True}


@router.get("/templates")
def corrective_action_templates():
    """常用整改措施模板"""
    return [
        {"key": "replace_filter", "text": "更换滤芯/滤膜"},
        {"key": "stop_device", "text": "停用该设备，待检修后重新启用"},
        {"key": "increase_disinfectant", "text": "加强消毒剂投加量"},
        {"key": "flush_pipe", "text": "冲洗管道后重新采样"},
        {"key": "resample", "text": "重新采样复检"},
        {"key": "repair_pipe", "text": "检修管道，排查渗漏点"},
        {"key": "clean_tank", "text": "清洗水箱/蓄水池"},
        {"key": "adjust_ph", "text": "调整pH至标准范围"},
        {"key": "check_equipment", "text": "检查水处理设备运行状态"},
        {"key": "notify_supervisor", "text": "上报主管，协调专业维修"},
    ]


@router.get("/export")
def export_alerts(
    status: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    db: Session = Depends(get_db),
):
    """导出异常清单为 Excel"""
    q = db.query(AlertRecord)
    if status == "open":
        q = q.filter(AlertRecord.resolved == False)
    elif status == "resolved":
        q = q.filter(AlertRecord.resolved == True)
    if start_date:
        q = q.filter(sqlfunc.date(AlertRecord.created_at) >= start_date)
    if end_date:
        q = q.filter(sqlfunc.date(AlertRecord.created_at) <= end_date)

    alerts = q.order_by(AlertRecord.created_at.desc()).all()
    items = _enrich_alerts(db, alerts)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "异常清单"
    ws.append(["报告编号", "检测日期", "采样点", "指标", "检测值", "异常描述", "严重程度", "状态", "整改措施", "创建时间"])

    severity_map = {"minor": "轻微", "moderate": "中度", "severe": "严重"}

    for it in items:
        ws.append([
            it["record_no"], it["test_date"], it["sample_point_name"],
            it["indicator_name"], it["value_text"], it["description"],
            severity_map.get(it["severity"], ""),
            "已处理" if it["resolved"] else "待处理",
            it["corrective_action"] or "", it["created_at"],
        ])

    # 冻结表头，自适应列宽
    ws.freeze_panes = "A2"
    for col in ws.columns:
        max_len = max(len(str(c.value or "")) for c in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=alerts_export.xlsx"},
    )


@router.get("/weekly-trend")
def weekly_trend(db: Session = Depends(get_db)):
    """近7天每日新增告警数"""
    from datetime import timedelta
    today = date.today()
    trend = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        cnt = db.query(AlertRecord).filter(
            sqlfunc.date(AlertRecord.created_at) == d
        ).count()
        trend.append({"date": str(d), "count": cnt})
    return trend


@router.get("/unresolved-count")
def unresolved_count(db: Session = Depends(get_db)):
    """未处理告警数（用于首页 Badge 通知）"""
    cnt = db.query(AlertRecord).filter(AlertRecord.resolved == False).count()
    return {"unresolved": cnt}
