from fastapi import APIRouter, UploadFile, File, Form, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List
import io
from datetime import timezone, timedelta

from backend.core.database import get_db
from backend.data_sources.common.models import PlanRamp, MasterFlight
from backend.apps.ramp.models import UploadHistory
from backend.apps.auth.models import User
from backend.core.config import settings
from backend.data_sources.schedule_pdf.parser import parse_draft_pdf
from backend.data_sources.aims_aar.parser import parse_rf_msg
from backend.core.security import get_current_user

router = APIRouter()

# 한국 시간(KST) 포맷 변환 함수
def format_kst(dt_obj):
    if not dt_obj:
        return ""
    # 타임존 정보가 없는(Naive) 시간일 경우 기본적으로 UTC로 간주
    if dt_obj.tzinfo is None:
        dt_obj = dt_obj.replace(tzinfo=timezone.utc)
    # KST(UTC+9)로 변환
    kst_tz = timezone(timedelta(hours=9))
    kst_time = dt_obj.astimezone(kst_tz)
    return kst_time.strftime("%m/%d %H:%M (KST)")

def _kst_to_zulu_date(kst_date_str: str) -> str:
    from datetime import datetime, timedelta
    import pytz
    if not kst_date_str: return ""
    try:
        # Assuming kst_date_str is like '2024-05-20 15:30' or '2024-05-20'
        if " " in kst_date_str:
            dt_kst = datetime.strptime(kst_date_str, "%Y-%m-%d %H:%M")
        else:
            dt_kst = datetime.strptime(kst_date_str, "%Y-%m-%d")
        
        kst_tz = pytz.timezone('Asia/Seoul')
        dt_kst_aware = kst_tz.localize(dt_kst)
        dt_utc = dt_kst_aware.astimezone(pytz.utc)
        return dt_utc.strftime("%Y-%m-%d")
    except:
        return kst_date_str[:10] if kst_date_str else ""

def _kst_to_zulu_time(kst_date_str: str) -> str:
    from datetime import datetime
    import pytz
    if not kst_date_str: return None
    try:
        if " " in kst_date_str:
            dt_kst = datetime.strptime(kst_date_str, "%Y-%m-%d %H:%M")
            kst_tz = pytz.timezone('Asia/Seoul')
            dt_kst_aware = kst_tz.localize(dt_kst)
            dt_utc = dt_kst_aware.astimezone(pytz.utc)
            return dt_utc.strftime("%H%M")
        return None
    except:
        return None

def normalize_flight_number(flight: str) -> str:
    flight = str(flight).upper().strip()
    if flight.startswith("RF"):
        return "EOK" + flight[2:]
    return flight

@router.post("/upload_pdf")
async def upload_pdf_endpoint(
    pdf_files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 인증 및 추적
):
    try:
        pdf_bytes_list =[io.BytesIO(await f.read()) for f in pdf_files]
        parsed_data = parse_draft_pdf(pdf_bytes_list)
        
        if not parsed_data:
            return JSONResponse(content={"status": "error", "message": "파싱된 데이터가 없습니다."})

        dates =[]
        for item in parsed_data:
            date_str, time_str = item["DATETIME_KST"].split(" ")
            dates.append(date_str)
            master_date_z = _kst_to_zulu_date(item["DATETIME_KST"])
            master_flight_num = normalize_flight_number(item['FLIGHT'])
            flight_id = f"{master_date_z}_{master_flight_num}"
            
            db_flight = db.query(PlanRamp).filter(PlanRamp.id == flight_id).first()
            
            if not db_flight:
                is_rf_val = str(item['FLIGHT']).upper().startswith("RF") or str(item['FLIGHT']).upper().startswith("EOK")
                new_flight = PlanRamp(
                    id=flight_id, 
                    flight_date=date_str,
                    flight_number=item['FLIGHT'], 
                    flight_type=item['TYPE'],
                    city=item["CITY"], 
                    base_time=item["DATETIME_KST"], 
                    base_stand=item["STAND"],
                    is_rf=is_rf_val
                )
                db.add(new_flight)
                db.flush()
                master = None
            else:
                db_flight.flight_date = date_str
                db_flight.flight_type = item["TYPE"]
                db_flight.city = item["CITY"]
                db_flight.base_time = item["DATETIME_KST"]
                db_flight.base_stand = item["STAND"]
                
                master = None
                if db_flight.master_id:
                    master = db.query(MasterFlight).filter(MasterFlight.id == db_flight.master_id).first()

            if master:
                active_stand = getattr(db_flight, "manual_stand", "") if db_flight else ""
                if not active_stand:
                    active_stand = str(item["STAND"])

                if item['TYPE'] == 'DEP':
                    master.dep_airport = "RKTU"
                    if not master.arr_airport:
                        master.arr_airport = str(item["CITY"])
                    master.dep_gate = active_stand
                else:
                    if not master.dep_airport:
                        master.dep_airport = str(item["CITY"])
                    master.arr_airport = "RKTU"
                    master.arr_gate = active_stand

        db.add(UploadHistory(
            file_type="PDF", 
            uploader=current_user.full_name,  # 로그인한 사용자 이름 저장
            target_start_date=min(dates), 
            target_end_date=max(dates)
        ))
        db.commit()
        return JSONResponse(content={"status": "success", "message": f"PDF 기준 스케줄 저장 완료 ({len(parsed_data)}건)"})
    except Exception as e:
        db.rollback()
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


@router.post("/upload_aar")
async def upload_aar_endpoint(
    msg_text: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 인증 및 추적
):
    try:
        parsed_data = parse_rf_msg(msg_text)
        if not parsed_data:
            return JSONResponse(content={"status": "error", "message": "파싱된 데이터가 없습니다."})

        dates =[]
        update_count = 0

        for item in parsed_data:
            flight_str = str(item["FLIGHT"]).upper()
            if not flight_str.startswith("RF") or (item["DEP"] != "CJJ" and item["ARR"] != "CJJ") or item["REG"] not in settings.AIRCRAFT_REGS:
                continue

            is_arr = item["ARR"] == "CJJ"
            flight_type = "ARR" if is_arr else "DEP"
            target_time = item["ETA_KST"] if is_arr else item["ETD_KST"]
            date_str = target_time[:10]
            dates.append(date_str)
            
            master_date_z = _kst_to_zulu_date(target_time)
            master_flight_num = normalize_flight_number(item['FLIGHT'])
            flight_id = f"{master_date_z}_{master_flight_num}"
            
            master = db.query(MasterFlight).filter(MasterFlight.id == flight_id).first()
            if not master:
                std_z = _kst_to_zulu_date(item.get("ETD_KST", "")) if item.get("ETD_KST") else None
                sta_z = _kst_to_zulu_date(item.get("ETA_KST", "")) if item.get("ETA_KST") else None
                master = MasterFlight(
                    id=flight_id,
                    flight_date_z=master_date_z,
                    aircraft_reg=item.get("REG", "UNKNOWN"),
                    dep_airport=item.get("DEP", ""),
                    arr_airport=item.get("ARR", ""),
                    flight_number=master_flight_num,
                    std_z=_kst_to_zulu_time(item.get("ETD_KST", "")),
                    sta_z=_kst_to_zulu_time(item.get("ETA_KST", ""))
                )
                db.add(master)
                db.flush()
            else:
                if item.get("REG") and item["REG"] != "UNKNOWN":
                    master.aircraft_reg = item["REG"]
                if item.get("DEP") and not master.dep_airport:
                    master.dep_airport = item["DEP"]
                if item.get("ARR") and not master.arr_airport:
                    master.arr_airport = item["ARR"]
            
            db_flight = db.query(PlanRamp).filter(PlanRamp.id == flight_id).first()
            is_rf_val = str(item['FLIGHT']).upper().startswith("RF") or str(item['FLIGHT']).upper().startswith("EOK")
            
            if db_flight:
                db_flight.aar_time = target_time       
                db_flight.aar_reg = item["REG"]
                db_flight.flight_date = date_str
                db_flight.flight_type = flight_type
                if not db_flight.master_id:
                    db_flight.master_id = flight_id
                update_count += 1
            else:
                new_flight = PlanRamp(
                    id=flight_id, 
                    master_id=flight_id,
                    flight_date=date_str,
                    flight_number=item['FLIGHT'], 
                    flight_type=flight_type,
                    city=item["DEP"] if is_arr else item["ARR"],
                    base_time=target_time, 
                    base_stand="미정",
                    aar_time=target_time, 
                    aar_reg=item["REG"],
                    is_rf=is_rf_val
                )
                db.add(new_flight)
                db.flush()
                update_count += 1

        db.add(UploadHistory(
            file_type="AAR", 
            uploader=current_user.full_name,  # 로그인한 사용자 이름 저장
            target_start_date=min(dates), 
            target_end_date=max(dates)
        ))
        db.commit()
        return JSONResponse(content={"status": "success", "message": f"AAR 운영 스케줄 업데이트 완료 ({update_count}건)"})
    except Exception as e:
        db.rollback()
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


@router.get("/upload_history")
async def get_upload_history(
    page: int = 1, 
    limit: int = 10, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # 인증된 사용자만 조회
):
    try:
        total_count = db.query(UploadHistory).count()
        total_count = min(total_count, 100)
        total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1
        page = min(page, total_pages) if total_count > 0 else page
        skip = (page - 1) * limit

        histories = db.query(UploadHistory).order_by(
            UploadHistory.target_end_date.desc(), 
            UploadHistory.uploaded_at.desc()
        ).offset(skip).limit(limit).all()
        
        data =[{
            "id": h.id, 
            "file_type": h.file_type, 
            "uploader": h.uploader,
            "target_start_date": h.target_start_date, 
            "target_end_date": h.target_end_date,
            "uploaded_at": format_kst(h.uploaded_at)  # 👈 KST 및 단위 적용됨
        } for h in histories]
            
        return JSONResponse(content={"status": "success", "data": data, "current_page": page, "total_pages": total_pages})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)