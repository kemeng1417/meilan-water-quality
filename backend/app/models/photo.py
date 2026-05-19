from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, func
from app.database import Base


class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("test_records.id"), nullable=False)
    sample_point_id = Column(Integer, ForeignKey("sample_points.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
