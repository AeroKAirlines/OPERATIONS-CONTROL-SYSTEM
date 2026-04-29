import uvicorn
import os
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.middleware.wsgi import WSGIMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime

# ---------------------------------------------------------
# 1. 각 프로그램(앱)들 가져오기
# ---------------------------------------------------------
from Ramp_App.main import app as ramp_app
from Booking_App.main import app as booking_app
from Checklist_App.main import app as checklist_app_flask
from Staff_Ticketing_App.main import app as staff_ticket_app
from Booking_App.main import update_data_job  # 예약률 스케줄러(파싱) 함수
# from FlightData_App.main import app as flight_data_app  # 운항 데이터 분석 시스템


# ---------------------------------------------------------
# 2. 서버가 켜질 때/꺼질 때 할 일 지정 (예약률 스케줄러 실행)
# ---------------------------------------------------------
@asynccontextmanager
async def portal_lifespan(app: FastAPI):
    print("🚀 [Aero K OCC 포털] 시스템 기동 및 스케줄러 시작...")
    scheduler = BackgroundScheduler()
    
    # 서버 켜지자마자 엑셀 1회 즉시 다운로드
    scheduler.add_job(update_data_job, next_run_time=datetime.now())
    # 평일 09시부터 18시까지 1시간 간격 정각마다 실행
    scheduler.add_job(update_data_job, 'cron', day_of_week='mon-fri', hour='9-18', minute=0)
    scheduler.start()
    
    yield  # 서버가 돌아가는 동안 대기하는 부분
    
    scheduler.shutdown()
    print("🛑 [Aero K OCC 포털] 시스템 및 스케줄러 안전 종료.")


# ---------------------------------------------------------
# 3. 포털 메인 서버(관리소장) 객체 생성
# ---------------------------------------------------------
portal_app = FastAPI(title="Aero K OCC Integrated System", lifespan=portal_lifespan)


# ---------------------------------------------------------
# 4. 포털 공통 디자인 파일(CSS, JS, 로고) 연결
# ---------------------------------------------------------
static_dir = "portal_static"
os.makedirs(static_dir, exist_ok=True)
portal_app.mount("/portal_static", StaticFiles(directory=static_dir), name="portal_static")


# ---------------------------------------------------------
# 5. 접속 시 첫 화면(로비) 띄우기
# ---------------------------------------------------------
@portal_app.get("/", response_class=HTMLResponse)
def portal_home():
    # occ_main.html 파일을 읽어서 화면에 뿌려줌
    file_path = os.path.join(os.path.dirname(__file__), "occ_main.html")
    with open(file_path, "r", encoding="utf-8") as f:
        html_content = f.read()
    return html_content


# ---------------------------------------------------------
# 6. 각 시스템(앱)들을 동 호수에 입주시키기 (핵심!)
# ---------------------------------------------------------
portal_app.mount("/ramp", ramp_app)                                 # 주기장은 1동
portal_app.mount("/booking", booking_app)                           # 예약률은 2동
portal_app.mount("/checklist", WSGIMiddleware(checklist_app_flask)) # 체크리스트는 3동
portal_app.mount("/staff_ticket", staff_ticket_app)                 # 임직원 티케팅은 4동
# portal_app.mount("/flight_data", flight_data_app)                   # 운항 데이터 분석은 4동


# ---------------------------------------------------------
# 7. 서버 실행
# ---------------------------------------------------------
if __name__ == "__main__":
    # Render가 제공하는 PORT 환경변수 사용 (없으면 10000)
    port = int(os.environ.get("PORT", 10000)) 
    
    # reload=True 삭제! (실제 서비스에서는 절대 사용 금지)
    uvicorn.run("portal_main:portal_app", host="0.0.0.0", port=port)