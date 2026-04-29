from sqlalchemy import create_engine
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 엑셀 데이터가 변환되어 저장될 SQLite DB 경로
DB_PATH = os.path.join(BASE_DIR, "flight_data.db")

DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

def get_engine():
    return engine
