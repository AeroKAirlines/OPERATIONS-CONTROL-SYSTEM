from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.core.database import Base
from backend.data_sources.common.models import MasterFlight

class PositionReport(Base):
    __tablename__ = "live_position_reports"

    id = Column(Integer, primary_key=True, index=True)
    flight_id = Column(String, ForeignKey("master_flights.id"), nullable=True)
    
    flight_number = Column(String, index=True)
    aircraft_reg = Column(String, index=True)
    report_time = Column(String)
    
    lat = Column(String, nullable=True)
    lon = Column(String, nullable=True)
    alt = Column(String, nullable=True)
    mch = Column(String, nullable=True)
    fob = Column(String, nullable=True)
    eta = Column(String, nullable=True)
    
    # Store full POSRPT line to ensure no data loss
    raw_message = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    master_flight = relationship("MasterFlight", backref="position_reports")

class CfdMessage(Base):
    __tablename__ = "live_cfd_messages"

    id = Column(Integer, primary_key=True, index=True)
    flight_id = Column(String, ForeignKey("master_flights.id"), nullable=True)
    
    flight_number = Column(String, index=True)
    aircraft_reg = Column(String, index=True)
    report_time = Column(String)
    
    fault_code = Column(String, index=True, nullable=True)
    fault_desc = Column(String, nullable=True)
    
    raw_message = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    master_flight = relationship("MasterFlight", backref="cfd_messages")

class Movement(Base):
    __tablename__ = "live_movements"

    id = Column(Integer, primary_key=True, index=True)
    flight_id = Column(String, ForeignKey("master_flights.id"), nullable=True)
    
    flight_number = Column(String, index=True)
    flight_date = Column(String, index=True)
    aircraft_reg = Column(String, index=True)
    
    # OOOI Times
    out_time = Column(String, nullable=True)
    off_time = Column(String, nullable=True)
    on_time = Column(String, nullable=True)
    in_time = Column(String, nullable=True)
    
    # Related Fuel Info for OOOI
    out_fob = Column(String, nullable=True)
    off_fob = Column(String, nullable=True)
    on_fob = Column(String, nullable=True)
    in_fob = Column(String, nullable=True)
    
    # Additional optional fields like ETA or DOR
    eta = Column(String, nullable=True)
    dor = Column(String, nullable=True)
    
    # Preserve full OOOI messages
    raw_messages = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    master_flight = relationship("MasterFlight", backref="movements")
