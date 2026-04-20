from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.core.database import Base
from backend.data_sources.common.models import MasterFlight

class Ofp(Base):
    __tablename__ = "plan_ofps"

    id = Column(Integer, primary_key=True, index=True)
    flight_id = Column(String, ForeignKey("master_flights.id"), nullable=True) # Linked to flight schedule if available
    
    cfp_number = Column(String, index=True)
    flight_number = Column(String, index=True)
    aircraft_reg = Column(String)
    
    dep_airport = Column(String)
    arr_airport = Column(String)
    date_str = Column(String)
    std = Column(String)
    sta = Column(String)
    etd = Column(String)
    eta = Column(String)
    
    # Pax & Weight Info
    pax_ttl = Column(Integer, nullable=True)
    pax_conf = Column(Integer, nullable=True)
    payload = Column(Integer, nullable=True)
    cargo_weight = Column(Integer, nullable=True)
    
    ezfw = Column(Integer, nullable=True)
    mzfw = Column(Integer, nullable=True)
    etow = Column(Integer, nullable=True)
    mtow = Column(Integer, nullable=True)
    eldw = Column(Integer, nullable=True)
    mldw = Column(Integer, nullable=True)
    dow = Column(Integer, nullable=True)
    agtow = Column(Integer, nullable=True)
    tcap = Column(Integer, nullable=True)
    
    # Fuel Info (Amounts and Times)
    trip_fuel = Column(Integer, nullable=True)
    trip_time = Column(String, nullable=True)
    cont_fuel = Column(Integer, nullable=True)
    cont_time = Column(String, nullable=True)
    altn_fuel = Column(Integer, nullable=True)
    altn_time = Column(String, nullable=True)
    frsv_fuel = Column(Integer, nullable=True)
    frsv_time = Column(String, nullable=True)
    addi_fuel = Column(Integer, nullable=True)
    addi_time = Column(String, nullable=True)
    taxi_fuel = Column(Integer, nullable=True)
    reqf_fuel = Column(Integer, nullable=True)
    reqf_time = Column(String, nullable=True)
    extra_fuel = Column(Integer, nullable=True)
    extra_time = Column(String, nullable=True)
    extra_reason = Column(String, nullable=True)
    ccf_fuel = Column(Integer, nullable=True)
    ccf_time = Column(String, nullable=True)
    tank_fuel = Column(Integer, nullable=True)
    tank_time = Column(String, nullable=True)
    ramp_fuel = Column(Integer, nullable=True)
    ramp_time = Column(String, nullable=True)
    min_rsv = Column(Integer, nullable=True)
    min_rsv_time = Column(String, nullable=True)
    efob = Column(Integer, nullable=True)
    efob_time = Column(String, nullable=True)
    
    # Ops Info
    apms = Column(Float, nullable=True)
    cost_index = Column(Integer, nullable=True)
    computed_time = Column(String)
    pln_fl = Column(String)
    dist_nam = Column(String)
    wind_temp = Column(String)
    tkof_altn = Column(String)
    route_str = Column(String)
    
    # Persons
    dispatcher = Column(String)
    pic = Column(String)
    
    # JSON Blocks (For multi-line strings or lists of objects)
    mel_cdl = Column(JSON, nullable=True)
    special_info = Column(JSON, nullable=True)
    ops_impacts = Column(JSON, nullable=True)
    alternates = Column(JSON, nullable=True)
    icao_fpl = Column(JSON, nullable=True)
    route_data = Column(JSON, nullable=True)
    tankering_data = Column(JSON, nullable=True)
    
    # Meta
    is_revision = Column(Boolean, default=False)
    revision_type = Column(String, nullable=True)
    raw_subject = Column(String)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    master_flight = relationship("MasterFlight", backref="ofp_data")
