from fastapi import FastAPI, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import json
import glob
import os
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime  # 🌟 추가된 모듈

from Booking_App.parser import parse_flight_data
from Booking_App.mail_fetcher import fetch_latest_excel

import sqlite3

# 글로벌 캐시 변수 (메모리에 데이터를 올려두어 응답 속도를 극대화)
cached_data = {}

def get_db_connection():
    db_path = "Booking_App/data/booking.db"
    os.makedirs("Booking_App/data", exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value TEXT)')
    cur.execute('''CREATE TABLE IF NOT EXISTS flights (
        flight_no TEXT PRIMARY KEY,
        dest TEXT,
        hub TEXT,
        direction TEXT,
        dep TEXT,
        arr TEXT
    )''')
    cur.execute('''CREATE TABLE IF NOT EXISTS daily_records (
        flight_no TEXT,
        date_str TEXT,
        lf REAL,
        ttl INTEGER,
        cfg INTEGER,
        PRIMARY KEY (flight_no, date_str)
    )''')
    conn.commit()
    return conn

def load_data_from_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT flight_no, dest, hub, direction, dep, arr FROM flights")
    flights = cur.fetchall()
    
    cur.execute("SELECT flight_no, date_str, lf, ttl, cfg FROM daily_records")
    records_db = cur.fetchall()
    conn.close()

    if not flights:
        return None
        
    records_by_flight = {}
    for r in records_db:
        f_no = r[0]
        if f_no not in records_by_flight: records_by_flight[f_no] = {}
        records_by_flight[f_no][r[1]] = {"lf": r[2], "ttl": r[3], "cfg": r[4]}
        
    result = {}
    for f in flights:
        f_no, dest, hub, direction, dep, arr = f
        if dest not in result: 
            result[dest] = {"all_dates": set(), "routes": {}}
        if hub not in result[dest]["routes"]: 
            result[dest]["routes"][hub] = {"왕편": {}, "복편": {}, "기타": {}}
        if direction not in result[dest]["routes"][hub]: 
            result[dest]["routes"][hub][direction] = {}
        
        f_records = records_by_flight.get(f_no, {})
        for d in f_records.keys():
            result[dest]["all_dates"].add(d)
                
        result[dest]["routes"][hub][direction][f_no] = {
            "flight_no": f_no, "dep": dep, "arr": arr, "records": f_records
        }
        
    for dest in result:
        result[dest]["all_dates"] = sorted(list(result[dest]["all_dates"]))
        
    return result

def save_data_to_db(result):
    conn = get_db_connection()
    cur = conn.cursor()
    
    for dest, dest_data in result.items():
        for hub, hub_data in dest_data.get("routes", {}).items():
            for dir_key, flights in hub_data.items():
                for f_no, f_data in flights.items():
                    cur.execute("INSERT OR REPLACE INTO flights (flight_no, dest, hub, direction, dep, arr) VALUES (?, ?, ?, ?, ?, ?)",
                                (f_no, dest, hub, dir_key, f_data.get("dep"), f_data.get("arr")))
                    for date_str, record in f_data.get("records", {}).items():
                        lf = record.get("lf", 0)
                        if isinstance(lf, str): lf = float(lf.replace('%', ''))
                        cur.execute("INSERT OR REPLACE INTO daily_records (flight_no, date_str, lf, ttl, cfg) VALUES (?, ?, ?, ?, ?)",
                                    (f_no, date_str, lf, record.get("ttl", 0), record.get("cfg", 0)))
    conn.commit()
    conn.close()

def get_latest_mail_date_from_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT value FROM sync_metadata WHERE key='latest_mail_date'")
    row = cur.fetchone()
    conn.close()
    if row:
        return row[0]
    return None

def save_latest_mail_date_to_db(date_str):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('latest_mail_date', ?)", (date_str,))
    conn.commit()
    conn.close()

def update_data_job():
    """이메일을 조회하여 최신 엑셀을 다운받고 파싱하는 메인 함수"""
    global cached_data
    print("\n🔄 [백그라운드] 데이터 업데이트 작업을 시작합니다...")
    
    # 1. 메모리 캐시에 데이터가 없으면 DB에서 먼저 불러오기 시도
    if not cached_data:
        db_data = load_data_from_db()
        if db_data:
            cached_data = db_data
            print("💾 DB에서 기존 예약률 데이터를 성공적으로 로드했습니다.")
            
    # 2. 이메일 서버를 조회하여 최신 엑셀 파일 가져오기
    target_date = fetch_latest_excel()
    
    # 3. 새로운 데이터가 없거나, 이미 최신 버전을 처리한 적이 있으면 건너뛰기
    last_saved_date = get_latest_mail_date_from_db()
    if target_date is None or (target_date == last_saved_date and cached_data):
        print(f"✅ 최신 데이터(기준일: {last_saved_date})가 이미 DB/메모리에 있습니다. 파싱을 생략합니다.\n")
        return
    
    # --- 이하 새로운 데이터 파싱 로직 ---
    print(f"🔄 새로운 기준일({target_date}) 엑셀이 발견되어 파싱을 시작합니다...")
    excel_files = glob.glob("Booking_App/data/report*.xlsx")
    excel_data = {}
    
    for file in excel_files:
        try:
            parsed = parse_flight_data(file)
            for dest, days in parsed.items():
                if dest not in excel_data:
                    excel_data[dest] = []
                excel_data[dest].extend(days)
        except Exception as e:
            print(f"[{file}] 읽기 실패: {e}")

    try:
        with open("Booking_App/data/schedule.json", "r", encoding="utf-8") as f:
            schedule_data = json.load(f)
    except Exception:
        schedule_data = {}

    result = {}
    for dest, days in excel_data.items():
        if not days: continue
        all_dates = sorted(list(set(day['date'] for day in days)))
        
        if dest not in result:
            result[dest] = { "all_dates": all_dates, "routes": {} }

        for day in days:
            date_str = day['date']
            for flight in day['flights']:
                f_no = str(flight['flight_no'])
                excel_dir = flight.get("direction", "왕편")
                excel_hub = flight.get("hub", "청주")
                sched = schedule_data.get(f_no)
                
                if sched:
                    hub = "인천" if "인천" in [sched['dep_port'], sched['arr_port']] else "청주"
                    dir_key = sched["direction"]
                    dep_time = sched["dep_time"]
                    arr_time = sched["arr_time"]
                else:
                    hub = excel_hub
                    dir_key = excel_dir
                    dep_time = "-"
                    arr_time = "-"
                
                if hub not in result[dest]["routes"]:
                    result[dest]["routes"][hub] = {"왕편": {}, "복편": {}, "기타": {}}
                
                if f_no not in result[dest]["routes"][hub][dir_key]:
                    result[dest]["routes"][hub][dir_key][f_no] = {
                        "flight_no": f_no, "dep": dep_time, "arr": arr_time, "records": {}
                    }
                
                result[dest]["routes"][hub][dir_key][f_no]["records"][date_str] = {
                    "lf": flight["lf"], "ttl": flight.get("ttl", 0), "cfg": flight.get("cfg", 0)
                }

    cached_data = result
    save_data_to_db(result)
    if target_date:
        save_latest_mail_date_to_db(target_date)
        
    print("✅ 데이터 파싱 및 DB 업데이트 완료! 이제 화면을 새로고침하면 최신 데이터가 보입니다.\n")

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    
    # 🌟 핵심 변경: 켜지자마자 실행되는 업데이트를 '백그라운드 스케줄러'로 넘겨서 서버 오픈을 막지 않습니다.
    scheduler.add_job(update_data_job, next_run_time=datetime.now())
    
    # 평일 자동 업데이트 스케줄
    scheduler.add_job(update_data_job, 'cron', day_of_week='mon-fri', hour='9,10,11', minute=0)
    scheduler.start()
    
    yield
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)
static_dir = "Booking_App/static"
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def read_root():
    return FileResponse('Booking_App/static/index.html')

@app.get("/api/data")
def get_data():
    return cached_data

@app.post("/api/sync")
def sync_data(background_tasks: BackgroundTasks):
    background_tasks.add_task(update_data_job)
    return {"message": "백그라운드에서 동기화 중입니다. 10~15초 후 화면을 새로고침 해주세요."}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)