from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import logging
from typing import Any
from datetime import datetime, timedelta

from backend.core.database import get_db, sync_lock
from backend.core.config import settings
from backend.data_sources.common.models import PlanRamp, MasterFlight, SyncState
from backend.data_sources.schedule_pdf.fetcher import fetch_pdf_emails
from backend.apps.ramp.upload import _kst_to_zulu_date, normalize_flight_number

logger = logging.getLogger(__name__)
router = APIRouter()

def run_pdf_fetch_job(limit: int = 10, db: Any = None, since_days: int = 0):
    """
    Background job to fetch PDF emails, parse them, and store in DB.
    """
    sync_lock.acquire()
    local_db = False
    try:
        if db is None:
            from backend.core.database import SessionLocal
            db = SessionLocal()
            local_db = True

        sync_state = db.query(SyncState).filter(SyncState.id == "pdf_email_uid").first()
        effective_last_uid = getattr(sync_state, "last_value", 0) if sync_state else 0

        logger.info(f"Running PDF email fetch job (last_uid: {effective_last_uid}, fallback limit: {limit}, since_days: {since_days}).")
        results, highest_uid = fetch_pdf_emails(last_uid=effective_last_uid, limit=limit, since_days=since_days)

        if not results:
            logger.info("No new PDF emails found or no data parsed.")
            if highest_uid > effective_last_uid:
                if not sync_state:
                    sync_state = SyncState(id="pdf_email_uid")
                    db.add(sync_state)
                sync_state.last_value = highest_uid
                db.commit()
            return {"status": "success", "message": "No new data", "highest_uid": highest_uid}

        update_count = 0
        for item in results:
            try:
                date_str, time_str = item["DATETIME_KST"].split(" ")
                master_date_z = _kst_to_zulu_date(item["DATETIME_KST"])
                master_flight_num = normalize_flight_number(item['FLIGHT'])
                flight_id = f"{master_date_z}_{master_flight_num}"
                
                db_flight = db.query(PlanRamp).filter(PlanRamp.id == flight_id).first()
                
                if not db_flight:
                    is_rf = str(item['FLIGHT']).upper().startswith("RF") or str(item['FLIGHT']).upper().startswith("TW") # Assuming EOK/RF is set, wait let's just do RF/EOK
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
                    master = None # PDF doesn't create master flight
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
                        active_stand = item["STAND"]

                    if item['TYPE'] == "DEP":
                        master.dep_gate = active_stand
                        master.dep_airport = "RKTU"
                        if not master.arr_airport:
                            master.arr_airport = str(item["CITY"])
                    elif item['TYPE'] == "ARR":
                        master.arr_gate = active_stand
                        master.arr_airport = "RKTU"
                        if not master.dep_airport:
                            master.dep_airport = str(item["CITY"])
                
                
                update_count += 1

            except Exception as e:
                logger.error(f"Error processing PDF record {item}: {e}")
                db.rollback()

        if highest_uid > effective_last_uid:
            if not sync_state:
                sync_state = SyncState(id="pdf_email_uid")
                db.add(sync_state)
            sync_state.last_value = highest_uid

        db.commit()
        logger.info(f"PDF fetch job complete. Processed {update_count} records. UID {effective_last_uid} -> {highest_uid}")
        
        return {"status": "success", "message": f"Processed {update_count} records", "highest_uid": highest_uid}

    except Exception as e:
        logger.error(f"Error in run_pdf_fetch_job: {e}")
        if db:
            db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        if local_db and db:
            db.close()
        sync_lock.release()
