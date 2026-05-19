from sqlalchemy import Column, Integer, String, Float, Boolean, Text, ForeignKey, UniqueConstraint
from app.database import Base


class TestDetail(Base):
    __tablename__ = "test_details"
    __table_args__ = (
        UniqueConstraint("record_id", "sample_point_id", "indicator_id", name="uq_detail"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("test_records.id"), nullable=False)
    sample_point_id = Column(Integer, ForeignKey("sample_points.id"), nullable=False)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), nullable=False)
    value_text = Column(String(100))
    value_num = Column(Float)
    is_qualified = Column(Boolean, nullable=True)
    is_abnormal = Column(Boolean, default=False)
    notes = Column(Text)
