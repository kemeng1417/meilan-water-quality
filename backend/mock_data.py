"""生成模拟检测数据 —— 覆盖近10天、三种水样类型、含超标异常"""
import random
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date, timedelta
from app.database import SessionLocal
from app.models import TestRecord, TestDetail, SamplePoint, Indicator, AlertRecord
from app.services.compliance import check_compliance

db = SessionLocal()

# ── 已存在的记录数检查 ──
existing = db.query(TestRecord).count()
if existing > 5:
    print(f"已有 {existing} 条记录，跳过模拟数据生成")
    db.close()
    exit()

# ── 基础配置 ──
TESTERS = ["张化验员", "王化验员", "陈化验员"]
REVIEWERS = ["李伟", "刘主任"]

# 出厂水+末梢水 采样点 (water_type_id: 1=出厂水, 2=末梢水)
FINISHED_TAP_POINTS = db.query(SamplePoint).filter(
    SamplePoint.water_type_id.in_([1, 2])
).all()
# 直饮水采样点 (water_type_id: 3)
DIRECT_POINTS = db.query(SamplePoint).filter(
    SamplePoint.water_type_id == 3
).all()

indicators = db.query(Indicator).order_by(Indicator.display_order).all()

# ── 模拟值生成器 ──
def generate_value(indicator, water_type_id, force_abnormal=False):
    """根据指标类型和水样类型生成合理的检测值"""
    name = indicator.name
    vtype = indicator.value_type

    if name == "肉眼可见物":
        return "有悬浮物" if force_abnormal else "无"
    elif name == "浑浊度":
        if force_abnormal:
            return str(round(random.uniform(1.5, 5.0), 1))
        else:
            # 出厂水/末梢水 0.2-0.8, 直饮水 0.1-0.4
            return str(round(random.uniform(0.2, 0.8) if water_type_id != 3 else random.uniform(0.1, 0.4), 1))
    elif name == "色度":
        if force_abnormal:
            return str(round(random.uniform(18, 30), 1))
        else:
            return str(round(random.uniform(0.5, 3.0), 1))
    elif name == "pH值":
        if force_abnormal:
            return str(round(random.choice([5.5, 9.2]), 1))
        else:
            return str(round(random.uniform(6.8, 8.0), 1))
    elif name == "COD（耗氧量）":
        if force_abnormal:
            return str(round(random.uniform(3.5, 6.0), 1))
        else:
            return "合格"
    elif name == "菌落总数":
        if force_abnormal:
            return str(random.randint(120, 500))
        else:
            return str(random.randint(0, 20))
    elif name == "总大肠菌群":
        return "检出" if force_abnormal else "未检出"
    elif name == "游离余氯":
        if force_abnormal:
            return "0.01"  # 过低
        else:
            if water_type_id == 1:
                return str(round(random.uniform(0.4, 0.8), 2))
            elif water_type_id == 2:
                return str(round(random.uniform(0.1, 0.4), 2))
            else:
                return str(round(random.uniform(0.02, 0.08), 2))
    elif name == "臭和味":
        return "有异味" if force_abnormal else "无异臭、异味"
    return "—"


def create_record(water_type_id, test_date, tester, status="draft", reviewer=None, with_abnormal=False, abnormal_points=1):
    """创建一条完整的检测记录并填充数据"""
    wt_codes = {1: "finished", 2: "tap", 3: "direct"}
    wt_code = wt_codes.get(water_type_id, "JC")
    wt = {1: "CCS", 2: "MSS", 3: "ZYS"}.get(water_type_id, "JC")

    date_str = test_date.strftime("%Y%m%d")
    count = db.query(TestRecord).filter(
        TestRecord.test_date == test_date,
        TestRecord.water_type_id == water_type_id,
    ).count()
    record_no = f"{wt}-{date_str}-{count + 1:03d}"

    record = TestRecord(
        record_no=record_no,
        water_type_id=water_type_id,
        test_date=test_date,
        report_date=test_date,
        tester=tester,
        reviewer=reviewer,
        status=status,
        conclusion="本次检测项目全部合格，符合标准要求。" if not with_abnormal else None,
    )
    db.add(record)
    db.flush()

    # 获取该水样类型的采样点
    if water_type_id in [1, 2]:
        points = FINISHED_TAP_POINTS
    else:
        points = DIRECT_POINTS

    # 决定哪些采样点有异常
    abnormal_sp_ids = set()
    if with_abnormal:
        selected = random.sample([p.id for p in points], min(abnormal_points, len(points)))
        abnormal_sp_ids = set(selected)

    has_any_abnormal = False
    abnormal_indicator_ids = {2, 5, 6, 7}  # 浑浊度/COD/菌落总数/大肠菌群

    for pt in points:
        for ind in indicators:
            is_abnormal = pt.id in abnormal_sp_ids and ind.id in abnormal_indicator_ids
            value = generate_value(ind, water_type_id, force_abnormal=is_abnormal)

            # 解析数值
            try:
                val_num = float(value)
            except ValueError:
                val_num = None

            detail = TestDetail(
                record_id=record.id,
                sample_point_id=pt.id,
                indicator_id=ind.id,
                value_text=value,
                value_num=val_num,
            )

            # 合规判定
            result = check_compliance(db, pt.id, ind.id, value, val_num)
            detail.is_qualified = result["is_qualified"]
            detail.is_abnormal = result["is_abnormal"]

            db.add(detail)
            db.flush()  # 确保 detail 获得 ID

            if result["is_abnormal"]:
                has_any_abnormal = True
                db.add(AlertRecord(
                    test_detail_id=detail.id,
                    record_id=record.id,
                    alert_type="exceed_limit",
                    description=result["alert_desc"],
                ))

    record.is_abnormal = has_any_abnormal
    if has_any_abnormal and not record.conclusion:
        record.conclusion = "部分采样点检测结果超标，需排查原因并整改。"
    db.flush()
    return record


# ── 生成数据 ──
today = date.today()
print(f"生成模拟数据 (基准日期: {today})...")

# === 出厂水+末梢水: 每天1条，连续10天 ===
for days_ago in range(10, 0, -1):
    d = today - timedelta(days=days_ago)
    tester = random.choice(TESTERS)
    # 每隔3-4天随机出现一次超标
    abnormal = (days_ago % 4 == 0)
    status = "reviewed"
    reviewer = random.choice(REVIEWERS)
    create_record(1, d, tester, status, reviewer, with_abnormal=abnormal, abnormal_points=1)
    create_record(2, d, tester, status, reviewer, with_abnormal=False)
print(f"  出厂水/末梢水: 各10条")

# === 直饮水: 每天1条，连续10天 ===
for days_ago in range(10, 0, -1):
    d = today - timedelta(days=days_ago)
    tester = random.choice(TESTERS)
    # 直饮水超标概率更高（多个点位）
    abnormal = (days_ago % 3 == 0)
    status = "reviewed"
    reviewer = random.choice(REVIEWERS)
    create_record(3, d, tester, status, reviewer, with_abnormal=abnormal, abnormal_points=random.randint(1, 3))
print(f"  直饮水: 10条")

# === 今天的草稿（未完成） ===
create_record(3, today, "张化验员", "draft", with_abnormal=False)
create_record(1, today, "张化验员", "draft", with_abnormal=False)
print(f"  今日草稿: 2条")

# === 昨天提交待审核 ===
yesterday = today - timedelta(days=1)
create_record(2, yesterday, "王化验员", "submitted", with_abnormal=True, abnormal_points=1)
print(f"  待审核: 1条")

db.commit()

total = db.query(TestRecord).count()
detail_count = db.query(TestDetail).count()
alert_count = db.query(AlertRecord).count()

print(f"\n模拟数据生成完成:")
print(f"  检测记录: {total} 条")
print(f"  检测明细: {detail_count} 条")
print(f"  告警记录: {alert_count} 条")
db.close()
