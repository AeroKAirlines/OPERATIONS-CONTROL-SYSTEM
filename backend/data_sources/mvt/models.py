from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.core.database import Base

class LiveMVT(Base):
    __tablename__ = "live_mvt"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    flight_id = Column(String, ForeignKey("master_flights.id"), nullable=True)
    
    msg_type = Column(String, index=True) # 'AD' (이륙) or 'AA' (램프인)
    flight_number = Column(String, index=True)
    flight_date = Column(String, index=True)
    aircraft_reg = Column(String, index=True)
    
    # Times (UTC format usually)
    block_off_time = Column(String, nullable=True)
    take_off_time = Column(String, nullable=True)
    touch_down_time = Column(String, nullable=True)
    block_in_time = Column(String, nullable=True)
    eta = Column(String, nullable=True)
    
    # Additional Info
    dest = Column(String, nullable=True)
    dla_code = Column(String, nullable=True)
    pax_adult = Column(Integer, nullable=True)
    pax_infant = Column(Integer, nullable=True)
    
    # Amendment Flag
    is_amendment = Column(Boolean, default=False)
    
    # Raw message log
    raw_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    master_flight = relationship("MasterFlight", backref="mvt_data")
