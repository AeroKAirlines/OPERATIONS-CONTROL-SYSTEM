from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
import logging
from datetime import datetime, timedelta
from backend.core.database import get_db, sync_lock
from backend.data_sources.common.models import MasterFlight, SyncState
from backend.data_sources.acars.models import Movement
from backend.data_sources.mvt.models import LiveMVT
from backend.data_sources.mvt.fetcher import fetch_mvt_emails

logger = logging.getLogger(__name__)

router = APIRouter()

_is_first_mvt_run = True

def _resolve_datetime_string(time_str: str | None, ref_day_str: str, now_utc: datetime) -> str | None:
    if not time_str:
        return None
        
    try:
        ref_day = int(ref_day_str)
        # Handle DDHHMM or HHMM
        if len(time_str) >= 6:
            day = int(time_str[:2])
            hour = int(time_str[2:4])
            minute = int(time_str[4:6])
        else:
            day = ref_day
            hour = int(time_str[:2])
            minute = int(time_str[2:4])
            
        # construct datetime
        dt = datetime(now_utc.year, now_utc.month, day, hour, minute)
        
        # Month crossover logic
        if now_utc.day < 5 and day > 25:
            dt = dt - timedelta(days=20)
            dt = dt.replace(day=day)
        elif now_utc.day > 25 and day < 5:
            dt = dt + timedelta(days=20)
            dt = dt.replace(day=day)
            
        return dt.strftime("%Y-%m-%d %H%M")
    except Exception as e:
        logger.error(f"Error resolving time string {time_str} with ref day {ref_day_str}: {e}")
        return None

def _resolve_flight_date(day_str: str, now_utc: datetime) -> str:
    try:
        day = int(day_str)
        dt = datetime(now_utc.year, now_utc.month, day)
        
        if now_utc.day < 5 and day > 25:
            dt = dt - timedelta(days=20)
            dt = dt.replace(day=day)
        elif now_utc.day > 25 and day < 5:
            dt = dt + timedelta(days=20)
            dt = dt.replace(day=day)
            
        return dt.strftime("%Y-%m-%d")
    except:
        return now_utc.strftime("%Y-%m-%d")

@router.get("/test-fetch")
def test_fetch_mvt_emails(limit: int = 10, db: Session = Depends(get_db)):
    sync_lock.acquire()
    try:
        sync_state = db.query(SyncState).filter(SyncState.id == "mvt_email_uid").first()
        last_uid = getattr(sync_state, "last_value") if sync_state else 0
        
        results, highest_uid = fetch_mvt_emails(last_uid=0, limit=limit) # Force fetch for test
        
        if not results:
            return {"message": "No MVT emails found or fetched."}
            
        for item in results:
            now_utc = item.get("email_date_utc", datetime.utcnow())
            
            flight_num = item.get("flight_number")
            day_str = item.get("flight_date", str(now_utc.day))
            reg = item.get("aircraft_reg")
            
            flight_date_z = _resolve_flight_date(day_str, now_utc)
            master_id = f"{flight_date_z}_{flight_num}"
            
            # Times
            out_z = _resolve_datetime_string(item.get("block_off_time"), day_str, now_utc)
            off_z = _resolve_datetime_string(item.get("take_off_time"), day_str, now_utc)
            on_z = _resolve_datetime_string(item.get("touch_down_time"), day_str, now_utc)
            in_z = _resolve_datetime_string(item.get("block_in_time"), day_str, now_utc)
            eta_z = _resolve_datetime_string(item.get("eta"), day_str, now_utc)
            
            # Save MVT record (Append Only)
            mvt_record = LiveMVT(
                flight_id=master_id,
                msg_type=item.get("msg_type"),
                flight_number=flight_num,
                flight_date=flight_date_z,
                aircraft_reg=reg,
                block_off_time=out_z,
                take_off_time=off_z,
                touch_down_time=on_z,
                block_in_time=in_z,
                eta=eta_z,
                dest=item.get("dest"),
                dla_code=item.get("dla_code"),
                pax_adult=item.get("pax_adult"),
                pax_infant=item.get("pax_infant"),
                is_amendment=item.get("is_amendment", False),
                raw_message=item.get("raw_message")
            )
            db.add(mvt_record)
            db.flush()
            
            # MasterFlight Logic
            master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
            if not master_record:
                master_record = MasterFlight(
                    id=master_id,
                    flight_date_z=flight_date_z,
                    flight_number=flight_num,
                    aircraft_reg=reg
                )
                db.add(master_record)
                db.flush()
                
            if item.get("pax_adult") is not None:
                master_record.pax_adult = item.get("pax_adult")
            if item.get("pax_infant") is not None:
                master_record.pax_infant = item.get("pax_infant")
            if item.get("dla_code"):
                master_record.dla_code = item.get("dla_code")
                
            # Status and Time Priority Logic
            # Check ACARS movement
            acars_mov = db.query(Movement).filter(
                Movement.flight_id == master_id
            ).first()
            
            # Retrieve the latest MVT for this flight to apply
            latest_mvt = db.query(LiveMVT).filter(
                LiveMVT.flight_id == master_id
            ).order_by(LiveMVT.created_at.desc()).first()
            
            def safe_get_acars(field):
                val = getattr(acars_mov, field, None) if acars_mov else None
                # Add a dummy date to acars HHMM string to match our format or just check if exists.
                # Actually acars stores "HHMM", not "YYYY-MM-DD HHMM".
                # Master stores "HHMM" or "YYYY-MM-DD HHMM". MVT stores "YYYY-MM-DD HHMM".
                # Let's just check if it exists for priority fallback
                return val
            
            # MVT timestamp formatting for MasterFlight (we extract only HHMM to match convention or full string)
            def extract_hhmm(dt_str):
                return dt_str.split(" ")[-1] if dt_str else None
            
            # OUT
            if latest_mvt and latest_mvt.block_off_time:
                master_record.out_time_z = extract_hhmm(latest_mvt.block_off_time)
            elif safe_get_acars("out_time"):
                master_record.out_time_z = safe_get_acars("out_time")
                
            # OFF
            if latest_mvt and latest_mvt.take_off_time:
                master_record.off_time_z = extract_hhmm(latest_mvt.take_off_time)
            elif safe_get_acars("off_time"):
                master_record.off_time_z = safe_get_acars("off_time")
                
            # ON
            if latest_mvt and latest_mvt.touch_down_time:
                master_record.on_time_z = extract_hhmm(latest_mvt.touch_down_time)
            elif safe_get_acars("on_time"):
                master_record.on_time_z = safe_get_acars("on_time")
                
            # IN
            if latest_mvt and latest_mvt.block_in_time:
                master_record.in_time_z = extract_hhmm(latest_mvt.block_in_time)
            elif safe_get_acars("in_time"):
                master_record.in_time_z = safe_get_acars("in_time")
                
            # ETA (Keep ACARS priority)
            if safe_get_acars("eta"):
                master_record.eta_z = safe_get_acars("eta")
            elif latest_mvt and latest_mvt.eta:
                master_record.eta_z = extract_hhmm(latest_mvt.eta)

            # Recalculate Status
            if master_record.in_time_z: master_record.status = "ARRIVED"
            elif master_record.on_time_z: master_record.status = "LANDED"
            elif master_record.off_time_z: master_record.status = "AIRBORNE"
            elif master_record.out_time_z: master_record.status = "DEPARTED"

        db.commit()
        return {"message": "MVT emails fetched and processed successfully.", "fetched_count": len(results)}
    except Exception as e:
        db.rollback()
        logger.error(f"Error in test_fetch_mvt: {e}")
        return {"error": str(e)}
    finally:
        sync_lock.release()

def run_mvt_fetch_job(close_db: bool = True):
    global _is_first_mvt_run
    
    from backend.core.database import SessionLocal
    db = SessionLocal()
    try:
        sync_lock.acquire()
        sync_state = db.query(SyncState).filter(SyncState.id == "mvt_email_uid").first()
        last_uid = getattr(sync_state, "last_value") if sync_state else 0
        
        if _is_first_mvt_run:
            logger.info("서버 기동 후 MVT 이메일 동기화를 시작합니다. 밀린 메일을 가져오는 데 시간이 조금 걸릴 수 있습니다...")
            _is_first_mvt_run = False
        elif last_uid == 0:
            logger.info("Starting initial 48-hour MVT email sync. This may take a moment...")
            
        results, highest_uid = fetch_mvt_emails(last_uid=last_uid, limit=800)
        
        if not results:
            if last_uid == 0:
                logger.info("Initial MVT sync complete. No emails found.")
            return
            
        if last_uid == 0:
            logger.info(f"Initial MVT sync found {len(results)} emails. Processing...")
            
        for item in results:
            now_utc = item.get("email_date_utc", datetime.utcnow())
            flight_num = item.get("flight_number")
            day_str = item.get("flight_date", str(now_utc.day))
            reg = item.get("aircraft_reg")
            flight_date_z = _resolve_flight_date(day_str, now_utc)
            master_id = f"{flight_date_z}_{flight_num}"
            
            # Save MVT record
            out_z = _resolve_datetime_string(item.get("block_off_time"), day_str, now_utc)
            off_z = _resolve_datetime_string(item.get("take_off_time"), day_str, now_utc)
            on_z = _resolve_datetime_string(item.get("touch_down_time"), day_str, now_utc)
            in_z = _resolve_datetime_string(item.get("block_in_time"), day_str, now_utc)
            eta_z = _resolve_datetime_string(item.get("eta"), day_str, now_utc)
            
            mvt_record = LiveMVT(
                flight_id=master_id,
                msg_type=item.get("msg_type"),
                flight_number=flight_num,
                flight_date=flight_date_z,
                aircraft_reg=reg,
                block_off_time=out_z,
                take_off_time=off_z,
                touch_down_time=on_z,
                block_in_time=in_z,
                eta=eta_z,
                dest=item.get("dest"),
                dla_code=item.get("dla_code"),
                pax_adult=item.get("pax_adult"),
                pax_infant=item.get("pax_infant"),
                is_amendment=item.get("is_amendment", False),
                raw_message=item.get("raw_message")
            )
            db.add(mvt_record)
            db.flush()
            
            master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
            if not master_record:
                master_record = MasterFlight(
                    id=master_id,
                    flight_date_z=flight_date_z,
                    flight_number=flight_num,
                    aircraft_reg=reg
                )
                db.add(master_record)
                db.flush()
                
            if item.get("pax_adult") is not None:
                master_record.pax_adult = item.get("pax_adult")
            if item.get("pax_infant") is not None:
                master_record.pax_infant = item.get("pax_infant")
            if item.get("dla_code"):
                master_record.dla_code = item.get("dla_code")
                
            acars_mov = db.query(Movement).filter(Movement.flight_id == master_id).first()
            mvt_ad = db.query(LiveMVT).filter(LiveMVT.flight_id == master_id, LiveMVT.msg_type == "AD").order_by(LiveMVT.created_at.desc()).first()
            mvt_aa = db.query(LiveMVT).filter(LiveMVT.flight_id == master_id, LiveMVT.msg_type == "AA").order_by(LiveMVT.created_at.desc()).first()
            latest_mvt = db.query(LiveMVT).filter(LiveMVT.flight_id == master_id).order_by(LiveMVT.created_at.desc()).first()
            
            def safe_get_acars(field):
                return getattr(acars_mov, field, None) if acars_mov else None
            
            def extract_hhmm(dt_str):
                return dt_str.split(" ")[-1] if dt_str else None
            
            if mvt_ad and mvt_ad.block_off_time:
                master_record.out_time_z = extract_hhmm(mvt_ad.block_off_time)
            elif safe_get_acars("out_time"):
                master_record.out_time_z = safe_get_acars("out_time")
                
            if mvt_ad and mvt_ad.take_off_time:
                master_record.off_time_z = extract_hhmm(mvt_ad.take_off_time)
            elif safe_get_acars("off_time"):
                master_record.off_time_z = safe_get_acars("off_time")
                
            if mvt_aa and mvt_aa.touch_down_time:
                master_record.on_time_z = extract_hhmm(mvt_aa.touch_down_time)
            elif safe_get_acars("on_time"):
                master_record.on_time_z = safe_get_acars("on_time")
                
            if mvt_aa and mvt_aa.block_in_time:
                master_record.in_time_z = extract_hhmm(mvt_aa.block_in_time)
            elif safe_get_acars("in_time"):
                master_record.in_time_z = safe_get_acars("in_time")
                
            if safe_get_acars("eta"):
                master_record.eta_z = safe_get_acars("eta")
            elif latest_mvt and latest_mvt.eta:
                master_record.eta_z = extract_hhmm(latest_mvt.eta)

            if master_record.in_time_z: master_record.status = "ARRIVED"
            elif master_record.on_time_z: master_record.status = "LANDED"
            elif master_record.off_time_z: master_record.status = "AIRBORNE"
            elif master_record.out_time_z: master_record.status = "DEPARTED"

        if int(highest_uid) > last_uid:
            if not sync_state:
                sync_state = SyncState(id="mvt_email_uid")
                db.add(sync_state)
            sync_state.last_value = int(highest_uid)
            
        db.commit()
        if last_uid == 0 and results:
            logger.info(f"Initial MVT sync successfully saved {len(results)} records.")
    except Exception as e:
        logger.error(f"Error in MVT fetch job: {e}")
        db.rollback()
    finally:
        sync_lock.release()
        if close_db:
            db.close()
