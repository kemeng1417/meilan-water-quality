from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


# ── Auth ──
class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    id: int
    username: str
    display_name: str
    role: str

    model_config = {"from_attributes": True}


# ── WaterType ──
class WaterTypeOut(BaseModel):
    id: int
    name: str
    code: str
    standard_code: str

    model_config = {"from_attributes": True}


# ── Indicator ──
class IndicatorOut(BaseModel):
    id: int
    name: str
    unit: Optional[str]
    category: str
    value_type: str
    display_order: int

    model_config = {"from_attributes": True}


# ── StandardLimit ──
class StandardLimitOut(BaseModel):
    id: int
    water_type_id: int
    indicator_id: int
    min_value: Optional[float]
    max_value: Optional[float]
    qual_check: Optional[str]
    remark: Optional[str]

    model_config = {"from_attributes": True}


# ── SamplePoint ──
class SamplePointOut(BaseModel):
    id: int
    water_type_id: int
    code: str
    name: str
    area: Optional[str]
    location: Optional[str]
    floor: Optional[str]
    is_active: bool
    sort_order: int

    model_config = {"from_attributes": True}


class SamplePointCreate(BaseModel):
    water_type_id: int
    code: str
    name: str
    area: Optional[str] = None
    location: Optional[str] = None
    floor: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


# ── TestDetail ──
class TestDetailOut(BaseModel):
    id: int
    record_id: int
    sample_point_id: int
    indicator_id: int
    value_text: Optional[str]
    value_num: Optional[float]
    is_qualified: Optional[bool]
    is_abnormal: bool
    notes: Optional[str]

    model_config = {"from_attributes": True}


class TestDetailUpdate(BaseModel):
    sample_point_id: int
    indicator_id: int
    value_text: Optional[str] = None
    notes: Optional[str] = None


# ── TestRecord ──
class TestRecordCreate(BaseModel):
    water_type_id: int
    test_date: date
    report_date: Optional[date] = None
    tester: str
    point_ids: Optional[list[int]] = None


class TestRecordUpdate(BaseModel):
    tester: Optional[str] = None
    reviewer: Optional[str] = None
    conclusion: Optional[str] = None
    status: Optional[str] = None


class TestRecordOut(BaseModel):
    id: int
    record_no: str
    water_type_id: int
    test_date: date
    report_date: date
    tester: str
    reviewer: Optional[str]
    conclusion: Optional[str]
    rejection_reason: Optional[str] = None
    status: str
    is_abnormal: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Alert ──
class AlertOut(BaseModel):
    id: int
    test_detail_id: int
    record_id: int
    alert_type: str
    description: Optional[str]
    corrective_action: Optional[str]
    resolved: bool
    resolved_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class AlertUpdate(BaseModel):
    corrective_action: Optional[str] = None
    resolved: Optional[bool] = None
    resolved_by: Optional[str] = None


# ── Dashboard ──
class DashboardSummary(BaseModel):
    today_records: int
    this_month_records: int
    abnormal_count: int
    pending_review: int
    qualification_rate: float


# ── Trend ──
class TrendDataPoint(BaseModel):
    test_date: date
    sampling_point_name: str
    indicator_name: str
    value_num: Optional[float]
    value_text: Optional[str]
    is_qualified: Optional[bool]
