from sqlalchemy import Column, Integer, String, Boolean
from backend.core.database import Base

class User(Base):
    __tablename__ = "admin_users"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String, unique=True, index=True) 
    hashed_password = Column(String)
    full_name = Column(String)                         
    is_active = Column(Boolean, default=True)