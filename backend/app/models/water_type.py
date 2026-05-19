from sqlalchemy import Column, Integer, String, Text
from app.database import Base


class WaterType(Base):
    __tablename__ = "water_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    code = Column(String(20), nullable=False)
    standard_code = Column(String(50), nullable=False)
    description = Column(Text)
