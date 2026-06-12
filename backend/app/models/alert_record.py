from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, func
from app.database import Base


class AlertRecord(Base):
    __tablename__ = "alert_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    test_detail_id = Column(Integer, ForeignKey("test_details.id"), nullable=False)
    record_id = Column(Integer, ForeignKey("test_records.id"), nullable=False)
    alert_type = Column(String(30), nullable=False, default="exceed_limit")
    description = Column(Text)
    corrective_action = Column(Text)
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime)
    resolved_by = Column(String(50))
    created_at = Column(DateTime, server_default=func.now())
