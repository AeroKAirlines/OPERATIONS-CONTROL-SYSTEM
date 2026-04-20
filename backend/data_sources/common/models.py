from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from backend.core.database import Base

class SyncState(Base):
    __tablename__ = "admin_sync_states"
    
    # ID e.g., "acars_email_uid", "ofp_email_uid"
    id = Column(String, primary_key=True, index=True)
    last_value = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class MasterFlight(Base):
    __tablename__ = "master_flights"

    id = Column(String, primary_key=True, index=True)
    
    # Master Flight fields
    flight_date_z = Column(String, index=True)
    aircraft_reg = Column(String, index=True)
    dep_airport = Column(String, index=True)
    arr_airport = Column(String, index=True)
    flight_number = Column(String, index=True)
    
    std_z = Column(String, nullable=True)
    etd_z = Column(String, nullable=True)
    sta_z = Column(String, nullable=True)
    out_time_z = Column(String, nullable=True)
    off_time_z = Column(String, nullable=True)
    on_time_z = Column(String, nullable=True)
    in_time_z = Column(String, nullable=True)
    eta_z = Column(String, nullable=True)
    
    dep_gate = Column(String, nullable=True)
    arr_gate = Column(String, nullable=True)
    
    # PAX & DLA Information (primarily from MVT)
    pax_adult = Column(Integer, nullable=True)
    pax_infant = Column(Integer, nullable=True)
    dla_code = Column(String, nullable=True)
    
    status = Column(String, default="SCHED")
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class PlanRamp(Base):
    __tablename__ = "plan_ramp"

    id = Column(String, primary_key=True, index=True)
    master_id = Column(String, ForeignKey("master_flights.id"), nullable=True)
    
    # RAMP specific schedule metadata (Draft/Preliminary)
    flight_date = Column(String, index=True)      
    flight_number = Column(String, index=True)    
    flight_type = Column(String) 
    city = Column(String, default="")
    is_rf = Column(Boolean, default=False)
    
    base_time = Column(String, default="")
    base_stand = Column(String, default="미정")
    aar_time = Column(String, default="")
    aar_reg = Column(String, default="UNKNOWN")
    manual_time = Column(String, default="")
    manual_stand = Column(String, default="")
    manual_reg = Column(String, default="")
    tow_offset = Column(Integer, default=30)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())