from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import logging
from typing import Any
from datetime import datetime, timedelta

from backend.core.database import get_db, sync_lock
from backend.core.config import settings
from backend.data_sources.common.models import PlanRamp, MasterFlight, SyncState
from backend.data_sources.aims_aar.fetcher import fetch_aar_emails
from backend.apps.ramp.upload import _kst_to_zulu_date, _kst_to_zulu_time, normalize_flight_number

logger = logging.getLogger(__name__)
router = APIRouter()

_is_first_aar_run = True

def run_aar_fetch_job(limit: int = 10, db: Any = None, since_days: int = 0):
    global _is_first_aar_run
    """
    Background job to fetch AAR emails, parse them, and store in DB.
    """
    sync_lock.acquire()
    local_db = False
    try:
        if db is None:
            from backend.core.database import SessionLocal
            db = SessionLocal()
            local_db = True

        sync_state = db.query(SyncState).filter(SyncState.id == "aar_email_uid").first()
        effective_last_uid = getattr(sync_state, "last_value", 0) if sync_state else 0

        logger.info(f"Running AAR email fetch job (last_uid: {effective_last_uid}, fallback limit: {limit}, since_days: {since_days}).")
        
        if _is_first_aar_run:
            logger.info("서버 기동 후 AAR(기동시간) 이메일 동기화를 시작합니다. 밀린 메일을 가져오는 데 시간이 조금 걸릴 수 있습니다...")
            _is_first_aar_run = False
            
        results, highest_uid = fetch_aar_emails(last_uid=effective_last_uid, limit=limit, since_days=since_days)

        if not results:
            logger.info("No new AAR emails found or no data parsed.")
            if highest_uid > effective_last_uid:
                if not sync_state:
                    sync_state = SyncState(id="aar_email_uid")
                    db.add(sync_state)
                sync_state.last_value = highest_uid
                db.commit()
            return {"status": "success", "message": "No new data", "highest_uid": highest_uid}

        update_count = 0
        for item in results:
            try:
                flight_str = str(item["FLIGHT"]).upper()
                if not flight_str.startswith("RF") or (item["DEP"] != "CJJ" and item["ARR"] != "CJJ") or item["REG"] not in settings.AIRCRAFT_REGS:
                    continue

                is_arr = item["ARR"] == "CJJ"
                flight_type = "ARR" if is_arr else "DEP"
                target_time = item["ETA_KST"] if is_arr else item["ETD_KST"]
                date_str = target_time[:10]
                
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

            except Exception as e:
                logger.error(f"Error processing AAR record {item}: {e}")
                db.rollback()

        if highest_uid > effective_last_uid:
            if not sync_state:
                sync_state = SyncState(id="aar_email_uid")
                db.add(sync_state)
            sync_state.last_value = highest_uid

        db.commit()
        logger.info(f"AAR fetch job complete. Processed {update_count} records. UID {effective_last_uid} -> {highest_uid}")
        
        return {"status": "success", "message": f"Processed {update_count} records", "highest_uid": highest_uid}

    except Exception as e:
        logger.error(f"Error in run_aar_fetch_job: {e}")
        if db:
            db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        if local_db and db:
            db.close()
        sync_lock.release()
