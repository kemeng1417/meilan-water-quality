"""种子数据：预置水样类型、检测指标、标准限值、采样点位和默认用户"""
from datetime import datetime
import bcrypt
from sqlalchemy.orm import Session

from app.database import engine, SessionLocal, Base
from app.models import (
    User, WaterType, SamplePoint, Indicator,
    StandardLimit, TestRecord, TestDetail, AlertRecord,
)


def seed_all():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(WaterType).count() > 0:
            return
        _seed_water_types(db)
        _seed_indicators(db)
        _seed_limits(db)
        _seed_sample_points(db)
        _seed_users(db)
        db.commit()
    finally:
        db.close()


def _seed_water_types(db: Session):
    types = [
        {"name": "出厂水", "code": "finished", "standard_code": "GB 5749-2022",
         "description": "供水站处理后出厂的生活饮用水"},
        {"name": "末梢水", "code": "tap", "standard_code": "GB 5749-2022",
         "description": "管网末梢的生活饮用水"},
        {"name": "直饮水", "code": "direct", "standard_code": "CJ 94-2005",
         "description": "航站楼直饮机经再净化处理后的管道直饮水"},
        {"name": "出厂水+末梢水", "code": "combined", "standard_code": "GB 5749-2022",
         "description": "出厂水与管网末梢水合并报告"},
    ]
    for t in types:
        db.add(WaterType(**t))
    db.flush()


def _seed_indicators(db: Session):
    indicators = [
        # (name, unit, category, value_type, display_order)
        ("肉眼可见物", None, "感官性状", "text", 1),
        ("浑浊度", "NTU", "感官性状", "numeric", 2),
        ("色度", "度", "感官性状", "numeric", 3),
        ("pH值", None, "一般化学", "numeric", 4),
        ("COD（耗氧量）", "mg/L", "一般化学", "numeric", 5),
        ("菌落总数", "CFU/mL", "微生物", "numeric", 6),
        ("总大肠菌群", None, "微生物", "text", 7),
        ("游离余氯", "mg/L", "消毒剂", "numeric", 8),
        ("臭和味", None, "感官性状", "text", 9),
    ]
    for name, unit, cat, vtype, order in indicators:
        db.add(Indicator(name=name, unit=unit, category=cat, value_type=vtype, display_order=order))
    db.flush()


def _seed_limits(db: Session):
    """为每种水样类型设置每项指标的限值"""
    # indicator_id 1-9 in order; water_type_id: 1=出厂水, 2=末梢水, 3=直饮水
    limits = [
        # (water_type_id, indicator_id, min_val, max_val, qual_check, remark)
        # 出厂水 - GB 5749-2022
        (1, 1, None, None, "无", None),
        (1, 2, None, 1.0, None, "水源与净水技术限制时为3"),
        (1, 3, None, 15.0, None, None),
        (1, 4, 6.5, 8.5, None, None),
        (1, 5, None, 3.0, None, "原水耗氧量>6mg/L时为5"),
        (1, 6, None, 100.0, None, None),
        (1, 7, None, None, "不应检出", None),
        (1, 8, 0.3, 2.0, None, "出厂水≥0.3mg/L"),
        (1, 9, None, None, "无异臭、异味", None),
        # 末梢水 - GB 5749-2022
        (2, 1, None, None, "无", None),
        (2, 2, None, 1.0, None, "水源与净水技术限制时为3"),
        (2, 3, None, 15.0, None, None),
        (2, 4, 6.5, 8.5, None, None),
        (2, 5, None, 3.0, None, "原水耗氧量>6mg/L时为5"),
        (2, 6, None, 100.0, None, None),
        (2, 7, None, None, "不应检出", None),
        (2, 8, 0.05, 2.0, None, "末梢水≥0.05mg/L"),
        (2, 9, None, None, "无异臭、异味", None),
        # 直饮水 - CJ 94-2005
        (3, 1, None, None, "无", None),
        (3, 2, None, 0.5, None, None),
        (3, 3, None, 5.0, None, None),
        (3, 4, 6.0, 8.5, None, None),
        (3, 5, None, 2.0, None, None),
        (3, 6, None, 50.0, None, None),
        (3, 7, None, None, "不应检出", None),
        (3, 8, 0.01, None, None, "直饮水≥0.01mg/L（检出限）"),
        (3, 9, None, None, "无异臭、异味", None),
    ]
    for wt_id, ind_id, mn, mx, qc, rem in limits:
        db.add(StandardLimit(
            water_type_id=wt_id, indicator_id=ind_id,
            min_value=mn, max_value=mx, qual_check=qc, remark=rem,
        ))
    db.flush()


def _seed_sample_points(db: Session):
    """预置采样点位"""
    # 出厂水点位 (water_type_id=1)
    finished_points = [
        ("CCS-01", "一期供水站出厂水", "一期供水站", None),
        ("CCS-02", "二期供水站出厂水", "二期供水站", None),
    ]
    for code, name, area, floor in finished_points:
        db.add(SamplePoint(water_type_id=1, code=code, name=name, area=area, sort_order=len(db.new)+1))

    # 末梢水点位 (water_type_id=2)
    tap_points = [
        ("MSS-01", "一期航站楼末梢水", "一期航站楼", None),
        ("MSS-02", "二期航站楼末梢水（国内出发）", "二期航站楼", None),
        ("MSS-03", "一期飞机加水口", "一期停机坪", None),
        ("MSS-04", "二期飞机加水口", "二期停机坪", None),
        ("MSS-05", "航站楼办公区末梢水", "办公区", None),
    ]
    for code, name, area, floor in tap_points:
        db.add(SamplePoint(water_type_id=2, code=code, name=name, area=area, sort_order=len(db.new)+1))

    # 直饮水点位 (water_type_id=3)
    direct_points = [
        ("27#0016", "27#0016直饮水机", "一期航站楼", "27#"),
        ("27#0003", "27#0003直饮水机", "一期航站楼", "27#"),
        ("28#0006", "28#0006直饮水机", "一期航站楼", "28#"),
        ("28#0019", "28#0019直饮水机", "一期航站楼", "28#"),
        ("3F1-0001", "3F1-0001直饮水机", "一期航站楼", "3F"),
        ("3F1-0008", "3F1-0008直饮水机", "一期航站楼", "3F"),
        ("3F2-0007", "3F2-0007直饮水机", "一期航站楼", "3F"),
        ("3F2-0005", "3F2-0005直饮水机", "一期航站楼", "3F"),
        ("3F2-男0024", "3F2男0024直饮水机", "一期航站楼", "3F"),
        ("3F2-女0024", "3F2女0024直饮水机", "一期航站楼", "3F"),
        ("1D1-280006", "1D1-280006直饮水机", "一期航站楼", "1F"),
        ("1D1-0011", "1D1-0011直饮水机", "一期航站楼", "1F"),
        ("1D1-080006", "1D1-080006直饮水机", "一期航站楼", "1F"),
        ("1D1-0017", "1D1-0017直饮水机", "一期航站楼", "1F"),
        ("1B1-0018", "1B1-0018直饮水机", "一期航站楼", "1F"),
        ("1B1-0004", "1B1-0004直饮水机", "一期航站楼", "1F"),
        ("2D1-0003", "2D1-0003直饮水机", "二期航站楼", "2F"),
        ("2D1-0006", "2D1-0006直饮水机", "二期航站楼", "2F"),
        ("2B2-0005", "2B2-0005直饮水机", "二期航站楼", "2F"),
        ("2B2-0021", "2B2-0021直饮水机", "二期航站楼", "2F"),
        ("2B2-0002", "2B2-0002直饮水机", "二期航站楼", "2F"),
        ("2B2-0007", "2B2-0007直饮水机", "二期航站楼", "2F"),
        ("2A3-0013", "2A3-0013直饮水机", "二期航站楼", "2F"),
        ("2A3-0027", "2A3-0027直饮水机", "二期航站楼", "2F"),
        ("2A3-0020", "2A3-0020直饮水机", "二期航站楼", "2F"),
        ("2A3-0016", "2A3-0016直饮水机", "二期航站楼", "2F"),
        ("1A3-0025", "1A3-0025直饮水机", "一期航站楼", "1F"),
        ("1A3-0005", "1A3-0005直饮水机", "一期航站楼", "1F"),
    ]
    for code, name, area, floor in direct_points:
        db.add(SamplePoint(water_type_id=3, code=code, name=name, area=area, floor=floor, sort_order=len(db.new)+1))

    db.flush()


def _seed_users(db: Session):
    users = [
        {"username": "admin", "password": "admin123", "display_name": "管理员", "role": "admin"},
        {"username": "zhang", "password": "123456", "display_name": "张化验员", "role": "tester"},
        {"username": "liwei", "password": "123456", "display_name": "李伟", "role": "reviewer"},
    ]
    for u in users:
        db.add(User(
            username=u["username"],
            password_hash=bcrypt.hashpw(u["password"].encode(), bcrypt.gensalt()).decode(),
            display_name=u["display_name"],
            role=u["role"],
        ))
    db.flush()


if __name__ == "__main__":
    seed_all()
    print("数据库初始化完成！")
