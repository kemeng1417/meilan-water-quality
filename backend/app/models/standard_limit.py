from sqlalchemy import Column, Integer, Float, String, Text, ForeignKey
from app.database import Base


class StandardLimit(Base):
    __tablename__ = "standard_limits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    water_type_id = Column(Integer, ForeignKey("water_types.id"), nullable=False)
    indicator_id = Column(Integer, ForeignKey("indicators.id"), nullable=False)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    qual_check = Column(String(50), nullable=True)
    remark = Column(Text)
