import sys
import traceback
import time

try:
    import os
    import uvicorn
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse
    from fastapi.staticfiles import StaticFiles

    from backend.core.database import engine, SessionLocal, Base
    from backend.data_sources.common.models import PlanRamp, MasterFlight
    from backend.apps.ramp.models import EventLog, UploadHistory
    from backend.apps.auth.models import User
    from backend.data_sources.ofp.models import Ofp
    from backend.data_sources.acars.models import PositionReport, Movement
    from backend.data_sources.mvt.models import LiveMVT
    from backend.apps.ramp import upload, schedule, admin
    from backend.apps.auth import routers as auth
    from backend.apps.replay.router import router as replay_router
    from backend.data_sources.ofp.router import router as ofp_router, run_ofp_fetch_job
    from backend.data_sources.acars.router import router as acars_router, run_acars_fetch_job
    from backend.data_sources.mvt.router import router as mvt_router, run_mvt_fetch_job
    from backend.data_sources.common.router import router as master_router
    from backend.data_sources.kac.router import router as kac_router
    from backend.core.security import get_password_hash
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    import atexit
    import logging

    logger = logging.getLogger("apscheduler")
    logger.setLevel(logging.INFO)

    # 🌟 DB가 켜질 때까지 최대 10초 대기하는 로직 추가
    print("데이터베이스 연결 시도 중...")
    for i in range(5):
        try:
            Base.metadata.create_all(bind=engine)
            print("데이터베이스 테이블 생성 완료!")
            break
        except Exception as e:
            print(f"DB 부팅 대기 중... ({i+1}/5)")
            time.sleep(2)

    # 최초 실행 시 기본 관리자 및 테스트 계정 생성
    def init_db():
        try:
            db = SessionLocal()
            from sqlalchemy import text
            
            # --- MVT / PAX schema migrations ---
            try:
                db.execute(text("ALTER TABLE master_flights ADD COLUMN pax_adult INTEGER"))
            except Exception as e:
                pass
            try:
                db.execute(text("ALTER TABLE master_flights ADD COLUMN pax_infant INTEGER"))
            except Exception as e:
                pass
            try:
                db.execute(text("ALTER TABLE master_flights ADD COLUMN dla_code VARCHAR"))
            except Exception as e:
                pass
                
            try:
                db.execute(text("ALTER TABLE plan_ramp ADD COLUMN eta_z VARCHAR"))
            except Exception as e:
                pass
            try:
                db.execute("ALTER TABLE master_flights ADD COLUMN pax_infant INTEGER")
            except Exception as e:
                pass
            try:
                db.execute("ALTER TABLE master_flights ADD COLUMN dla_code VARCHAR")
            except Exception as e:
                pass
                
            try:
                db.execute("ALTER TABLE plan_ramp ADD COLUMN eta_z VARCHAR")
                db.commit()
                print("Added eta_z to flights")
            except Exception:
                db.rollback()
                pass # Already exists
            
            # 1. Admin 계정 생성
            if not db.query(User).filter(User.username == "admin").first():
                admin_user = User(
                    username="admin", 
                    hashed_password=get_password_hash("admin123"), 
                    full_name="시스템 관리자"
                )
                db.add(admin_user)
                
            # 2. 테스트 계정(eokocc) 생성
            if not db.query(User).filter(User.username == "eokocc").first():
                test_user = User(
                    username="eokocc", 
                    hashed_password=get_password_hash("Qwer123!"), 
                    full_name="테스트 계정"
                )
                db.add(test_user)
                print("테스트 계정(eokocc / Qwer123!)이 성공적으로 생성되었습니다!")
            
            # 3. 초기 구동 시 무결성 검증 (Catch-up)
            from backend.data_sources.common.models import SyncState
            
            # PDF 검증 (14일)
            from backend.data_sources.schedule_pdf.router import run_pdf_fetch_job
            pdf_sync = db.query(SyncState).filter(SyncState.id == "pdf_email_uid").first()
            if not pdf_sync or getattr(pdf_sync, "last_value", 0) == 0:
                print("초기 구동: 최근 14일 이내의 PDF 데이터를 동기화합니다...")
                run_pdf_fetch_job(limit=5, db=db, since_days=14)
                
            # AAR 검증 (14일)
            from backend.data_sources.aims_aar.router import run_aar_fetch_job
            aar_sync = db.query(SyncState).filter(SyncState.id == "aar_email_uid").first()
            if not aar_sync or getattr(aar_sync, "last_value", 0) == 0:
                print("초기 구동: 최근 14일 이내의 AAR 데이터를 동기화합니다...")
                run_aar_fetch_job(limit=30, db=db, since_days=14)
            
            # OFP 검증 (48시간)
            ofp_sync = db.query(SyncState).filter(SyncState.id == "ofp_email_uid").first()
            if not ofp_sync or getattr(ofp_sync, "last_value", 0) == 0:
                print("초기 구동: 최근 48시간 이내의 OFP 데이터를 동기화합니다...")
                run_ofp_fetch_job(limit=100, db=db, since_days=2)
            
            # ACARS 검증 (6시간)
            acars_sync = db.query(SyncState).filter(SyncState.id == "acars_email_uid").first()
            if not acars_sync or getattr(acars_sync, "last_value", 0) == 0:
                print("초기 구동: 최근 6시간 이내의 ACARS 데이터를 동기화합니다...")
                run_acars_fetch_job(limit=400, db=db, since_days=1)

            db.commit()
            db.close()
        except Exception as e:
            print("DB 초기화/동기화 중 에러 발생:", e)

    init_db()

    portal_app = FastAPI(title="Aero K OCC Integrated System")

    BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))

    portal_static_dir = os.path.join(BASE_DIR, "frontend", "portal", "portal_static")
    ramp_static_dir = os.path.join(BASE_DIR, "frontend", "ramp", "ui")

    portal_app.mount("/portal_static", StaticFiles(directory=portal_static_dir), name="portal_static")
    portal_app.mount("/ramp/ui", StaticFiles(directory=ramp_static_dir, html=True), name="ramp_static")

    portal_app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
    portal_app.include_router(upload.router, prefix="/ramp/api", tags=["Upload"])
    portal_app.include_router(schedule.router, prefix="/ramp/api", tags=["Schedule"])
    portal_app.include_router(admin.router, prefix="/ramp/api/admin", tags=["Admin"])
    portal_app.include_router(master_router, prefix="/api/flights", tags=["MasterFlights"])
    portal_app.include_router(ofp_router, prefix="/api/ofp", tags=["OFP"])
    portal_app.include_router(acars_router, prefix="/api/acars", tags=["ACARS"])
    portal_app.include_router(mvt_router, prefix="/api/mvt", tags=["MVT"])
    portal_app.include_router(kac_router, prefix="/api/proxy", tags=["KAC"])
    portal_app.include_router(replay_router, prefix="/api/replay", tags=["Replay"])

    # --- Setup Background Scheduler ---
    from backend.data_sources.schedule_pdf.router import run_pdf_fetch_job, router as pdf_router
    from backend.data_sources.aims_aar.router import run_aar_fetch_job, router as aar_router
    from datetime import datetime

    portal_app.include_router(pdf_router, prefix="/api/pdf", tags=["PDF"])
    portal_app.include_router(aar_router, prefix="/api/aar", tags=["AAR"])

    scheduler = BackgroundScheduler()
    
    # Run ACARS fetch every 30 seconds
    scheduler.add_job(
        run_acars_fetch_job,
        trigger=IntervalTrigger(seconds=30),
        id="acars_fetch_job",
        name="Fetch latest ACARS emails every 30 seconds",
        replace_existing=True,
        next_run_time=datetime.now()
    )
    
    # Run OFP fetch every 1 minute
    scheduler.add_job(
        run_ofp_fetch_job,
        trigger=IntervalTrigger(minutes=1),
        id="ofp_fetch_job",
        name="Fetch latest OFP emails every 1 minute",
        replace_existing=True,
        next_run_time=datetime.now()
    )

    # Run PDF fetch every 3 minutes
    scheduler.add_job(
        run_pdf_fetch_job,
        trigger=IntervalTrigger(minutes=3),
        id="pdf_fetch_job",
        name="Fetch latest CJJ RAMP TABLE PDF emails every 3 minutes",
        replace_existing=True,
        next_run_time=datetime.now()
    )

    # Run AAR fetch every 3 minutes
    scheduler.add_job(
        run_aar_fetch_job,
        trigger=IntervalTrigger(minutes=3),
        id="aar_fetch_job",
        name="Fetch latest AAR emails every 3 minutes",
        replace_existing=True,
        next_run_time=datetime.now()
    )
    
    # Run MVT fetch every 30 seconds
    scheduler.add_job(
        run_mvt_fetch_job,
        trigger=IntervalTrigger(seconds=30),
        id="mvt_fetch_job",
        name="Fetch latest MVT emails every 30 seconds",
        replace_existing=True,
        next_run_time=datetime.now()
    )
    
    scheduler.start()
    atexit.register(lambda: scheduler.shutdown())

    @portal_app.get("/api/config.js", response_class=HTMLResponse)
    def serve_config_js():
        import json
        config_path = os.path.join(BASE_DIR, "backend", "core", "shared_config.json")
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = f.read()
            js_content = f"window.SHARED_CONFIG = {data};\nwindow.airportCoords = SHARED_CONFIG.AIRPORT_COORDS;\nwindow.OFP_CONFIG = SHARED_CONFIG;"
            from fastapi import Response
            return Response(content=js_content, media_type="application/javascript")
        except Exception as e:
            return Response(content=f"console.error('Config load failed: {e}');", media_type="application/javascript")

    @portal_app.get("/", response_class=HTMLResponse)
    def portal_home():
        with open(os.path.join(BASE_DIR, "frontend", "portal", "occ_main.html"), "r", encoding="utf-8") as f:
            return f.read()

    @portal_app.get("/login", response_class=HTMLResponse)
    def login_page():
        with open(os.path.join(BASE_DIR, "frontend", "portal", "login.html"), "r", encoding="utf-8") as f:
            return f.read()

    @portal_app.get("/replay", response_class=HTMLResponse)
    def replay_page():
        with open(os.path.join(BASE_DIR, "frontend", "portal", "occ_replay.html"), "r", encoding="utf-8") as f:
            return f.read()

    if __name__ == "__main__":
        port = int(os.environ.get("PORT", 8000))
        print("\n" + "="*50)
        print("Aero K OCC 시스템 서버가 정상적으로 실행되었습니다!")
        print(f"접속 주소: http://0.0.0.0:{port}")
        print("="*50 + "\n")
        
        # When run directly, we might need to specify the module path or just run it via portal_app
        uvicorn.run("backend.main:portal_app", host="0.0.0.0", port=port, reload=False)

except Exception as e:
    print("\n" + "="*60)
    print("서버 실행 중 에러가 발생했습니다!")
    traceback.print_exc()
    print("="*60)