from sqlalchemy import Column, Integer, String, Boolean, Float, ForeignKey
from app.database import Base


class SamplePoint(Base):
    __tablename__ = "sample_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    water_type_id = Column(Integer, ForeignKey("water_types.id"), nullable=False)
    code = Column(String(30), nullable=False)
    name = Column(String(100), nullable=False)
    area = Column(String(100))
    location = Column(String(200))
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    # For 直饮水 dispensers: floor info and dispenser-specific attributes
    floor = Column(String(20))
