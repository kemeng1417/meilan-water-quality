from sqlalchemy import Column, Integer, String, Date, Boolean, DateTime, Text, ForeignKey, func
from app.database import Base


class TestRecord(Base):
    __tablename__ = "test_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_no = Column(String(30), unique=True, nullable=False)
    water_type_id = Column(Integer, ForeignKey("water_types.id"), nullable=False)
    test_date = Column(Date, nullable=False)
    report_date = Column(Date, nullable=False)
    tester = Column(String(30), nullable=False)
    reviewer = Column(String(30))
    conclusion = Column(Text)
    status = Column(String(20), default="draft")
    rejection_reason = Column(Text)
    is_abnormal = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
