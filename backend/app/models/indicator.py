from sqlalchemy import Column, Integer, String, Boolean
from app.database import Base


class Indicator(Base):
    __tablename__ = "indicators"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False)
    unit = Column(String(20))
    category = Column(String(30), nullable=False)
    value_type = Column(String(20), nullable=False, default="numeric")
    display_order = Column(Integer, default=0)
