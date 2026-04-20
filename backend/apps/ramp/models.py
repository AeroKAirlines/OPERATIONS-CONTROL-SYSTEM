from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from backend.core.database import Base

class EventLog(Base):
    __tablename__ = "admin_event_logs"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    flight_id = Column(String, ForeignKey("master_flights.id")) 
    event_type = Column(String)                          
    worker = Column(String)                              
    payload = Column(JSON) # 로그 상세 내용은 예외적으로 JSON 허용                           
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class UploadHistory(Base):
    __tablename__ = "admin_upload_histories"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    file_type = Column(String)           
    uploader = Column(String)            
    target_start_date = Column(String)   
    target_end_date = Column(String)     
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())