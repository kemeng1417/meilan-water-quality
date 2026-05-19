"""合规判定引擎 —— 将检测值与标准限值比对，判定是否合格"""
import re
from sqlalchemy.orm import Session
from app.models import StandardLimit, SamplePoint


def _parse_numeric(text: str | None) -> float | None:
    """尝试从文本中提取数值，支持'<0.01'、'0.5NTU'、'合格'等形式"""
    if not text:
        return None
    text = text.strip()
    # 处理 "合格" → 对于 COD 等指标，填入"合格"表示达标
    if text in ("合格", "—", "/"):
        return None
    # 提取数字部分
    m = re.search(r'[\d.]+', text)
    if m:
        try:
            return float(m.group())
        except ValueError:
            return None
    return None


def check_compliance(db: Session, sample_point_id: int, indicator_id: int,
                     value_text: str | None, value_num: float | None) -> dict:
    """判定单个检测结果是否合格，返回 {is_qualified, is_abnormal, alert_desc}"""

    sp = db.query(SamplePoint).filter(SamplePoint.id == sample_point_id).first()
    if not sp:
        return {"is_qualified": True, "is_abnormal": False, "alert_desc": None}

    limit = db.query(StandardLimit).filter(
        StandardLimit.water_type_id == sp.water_type_id,
        StandardLimit.indicator_id == indicator_id,
    ).first()

    if not limit:
        return {"is_qualified": True, "is_abnormal": False, "alert_desc": None}

    # 1. 定性判定（如"无"、"不应检出"、"无异臭、异味"）
    if limit.qual_check:
        if limit.qual_check == "不应检出":
            qualifiers = ("未检出", "0", "—", "/", "<1", "阴性", "未发现")
            if value_text and value_text.strip() not in qualifiers:
                return {
                    "is_qualified": False, "is_abnormal": True,
                    "alert_desc": f"检测结果'{value_text}'，但标准要求「不应检出」"
                }
        elif limit.qual_check in ("无", "无异臭、异味"):
            qualifiers = ("无", "无异臭、异味", "合格", "—", "/")
            if value_text and value_text.strip() not in qualifiers:
                return {
                    "is_qualified": False, "is_abnormal": True,
                    "alert_desc": f"检测结果'{value_text}'，但标准要求「{limit.qual_check}」"
                }
        return {"is_qualified": True, "is_abnormal": False, "alert_desc": None}

    # 2. 数值判定
    # 尝试从 value_text 二次解析数值（处理前端传 "合格"/"<0.5" 等情况）
    if value_num is None and value_text:
        value_num = _parse_numeric(value_text)

    # 标记"合格"的特殊处理：对于纯数字指标填入"合格"，视为达标
    if value_text and value_text.strip() == "合格":
        return {"is_qualified": True, "is_abnormal": False, "alert_desc": None}

    if value_num is None:
        return {"is_qualified": None, "is_abnormal": False, "alert_desc": None}

    if limit.max_value is not None and value_num > limit.max_value:
        return {
            "is_qualified": False, "is_abnormal": True,
            "alert_desc": f"检测值 {value_num} 超过上限 {limit.max_value}"
        }
    if limit.min_value is not None and value_num < limit.min_value:
        return {
            "is_qualified": False, "is_abnormal": True,
            "alert_desc": f"检测值 {value_num} 低于下限 {limit.min_value}"
        }

    return {"is_qualified": True, "is_abnormal": False, "alert_desc": None}
