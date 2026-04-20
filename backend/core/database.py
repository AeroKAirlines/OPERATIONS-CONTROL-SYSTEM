import os
import threading
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Global lock for background sync jobs to prevent concurrent DB unique constraint violations
sync_lock = threading.Lock()

# 프로젝트 루트 경로 계산 (backend/core/database.py -> backend/core -> backend -> 루트)
BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
DB_DIR = os.path.join(BASE_DIR, "db")

# db 폴더가 없으면 자동 생성
if not os.path.exists(DB_DIR):
    os.makedirs(DB_DIR, exist_ok=True)

DB_PATH = os.path.join(DB_DIR, "occ_core.db")

# 🌟 환경변수 DATABASE_URL이 있으면 우선 사용하고, 없으면 직관적인 단일 SQLite 파일을 사용
SQLALCHEMY_DATABASE_URL = os.environ.get(
    "DATABASE_URL", 
    f"sqlite:///{DB_PATH}"
)

# SQLite인 경우 동시성 문제(Database is locked)를 해결하기 위해 옵션과 WAL 모드를 켭니다.
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, 
        connect_args={
            "check_same_thread": False,
            "timeout": 15  # 락이 걸려있을 때 기다리는 시간(초)
        }
    )
    
    # SQLite 연결 시 WAL 모드 활성화 이벤트
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()