from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import logging
from backend.core.database import get_db, sync_lock
from backend.data_sources.ofp.fetcher import fetch_ofp_emails
from backend.data_sources.ofp.parser import extract_raw_text_from_pdf, parse_ofp_text
from backend.data_sources.ofp.models import Ofp

logger = logging.getLogger(__name__)

router = APIRouter()

_is_first_ofp_run = True

from typing import Any, Optional, List, Dict
from datetime import datetime

def _get_zulu_date_from_ofp(date_str: str) -> str:
    if not date_str:
        return datetime.utcnow().strftime("%Y-%m-%d")
        
    try:
        import re
        if re.match(r"^\d{2}\.\d{2}\.\d{2}", date_str):
            dt = datetime.strptime(date_str[:8], "%y.%m.%d")
            return dt.strftime("%Y-%m-%d")
        if len(date_str) >= 7:
            dt = datetime.strptime(date_str[:7], "%d%b%y")
            return dt.strftime("%Y-%m-%d")
        elif len(date_str) >= 5:
            dt = datetime.strptime(date_str[:5], "%d%b")
            now = datetime.utcnow()
            dt = dt.replace(year=now.year)
            if now.month == 1 and dt.month == 12:
                dt = dt.replace(year=now.year - 1)
            elif now.month == 12 and dt.month == 1:
                dt = dt.replace(year=now.year + 1)
            return dt.strftime("%Y-%m-%d")
            
        return datetime.utcnow().strftime("%Y-%m-%d")
    except Exception as e:
        logger.error(f"Date parsing error for {date_str}: {e}")
        return datetime.utcnow().strftime("%Y-%m-%d")

def clean_int(val_str: Any) -> Optional[int]:
    if not val_str:
        return None
    try:
        return int(val_str)
    except:
        return None

def clean_float(val_str: Any) -> Optional[float]:
    if not val_str:
        return None
    try:
        return float(val_str)
    except:
        return None

def run_ofp_fetch_job(limit: int = 5, db: Any = None, since_days: int = 0):
    global _is_first_ofp_run
    
    sync_lock.acquire()
    close_db = False
    try:
        if db is None:
            db = next(get_db())
            close_db = True
            
        from backend.data_sources.common.models import SyncState
        sync_state = None
        if hasattr(db, 'query'):
            sync_state = db.query(SyncState).filter(SyncState.id == "ofp_email_uid").first()
        last_uid = 0
        if sync_state and getattr(sync_state, "last_value", None) is not None:
            last_uid = int(str(getattr(sync_state, "last_value")))
            
        effective_last_uid = 0 if since_days > 0 else last_uid

        logger.info(f"Running OFP email fetch job (last_uid: {effective_last_uid}, fallback limit: {limit}, since_days: {since_days}).")
        
        if _is_first_ofp_run:
            logger.info("서버 기동 후 OFP(비행계획서) 이메일 동기화를 시작합니다. 밀린 메일을 가져오는 데 시간이 조금 걸릴 수 있습니다...")
            _is_first_ofp_run = False
            
        results, highest_uid = fetch_ofp_emails(last_uid=effective_last_uid, limit=limit, since_days=since_days)
        
        if not results:
            logger.info("No new OFP emails found.")
            if int(highest_uid) > last_uid:
                if sync_state is None:
                    sync_state = SyncState(id="ofp_email_uid")
                    setattr(sync_state, "last_value", int(highest_uid))
                    db.add(sync_state)
                else:
                    setattr(sync_state, "last_value", int(highest_uid))
                db.commit()
            return
        
        total_items = len(results)
        print(f"\n[OFP Sync] {total_items} plan files found. Updating DB...")

        response_data = []

        for i, item in enumerate(results):
            if not isinstance(item, dict):
                continue
            
            if total_items > 2:
                progress = (i + 1) / total_items * 100
                print(f"  > OFP Progress: {progress:3.0f}% ({i + 1}/{total_items})", end="\r")

            try:
                parsed_subject_list = item["parsed_subject_list"]
                pdf_bytes = item["pdf_bytes"]
                
                text_dump = extract_raw_text_from_pdf(pdf_bytes)
                target_cfps =[s["cfp_nbr"] for s in parsed_subject_list]
                parsed_blocks = parse_ofp_text(text_dump, target_cfps)
                
                for block_data in parsed_blocks:
                    cfp_number = block_data.get("cfp_number")
                    flight_number = block_data.get("flight_number")
                    subject_meta = next((s for s in parsed_subject_list if s["cfp_nbr"] == cfp_number), {})
                    
                    db_record = db.query(Ofp).filter(Ofp.cfp_number == cfp_number).first()
                    if not db_record:
                        db_record = Ofp(cfp_number=cfp_number)
                        db.add(db_record)
                    
                    # ==== OFP 데이터 매핑 (ETD/ETA 완벽 포함) ====
                    setattr(db_record, "flight_number", flight_number)
                    setattr(db_record, "aircraft_reg", block_data.get("aircraft_reg"))
                    setattr(db_record, "date_str", block_data.get("date"))
                    setattr(db_record, "dep_airport", block_data.get("dep_airport"))
                    setattr(db_record, "arr_airport", block_data.get("arr_airport"))
                    setattr(db_record, "std", block_data.get("std"))
                    setattr(db_record, "sta", block_data.get("sta"))
                    setattr(db_record, "etd", block_data.get("etd")) # [추가된 핵심 코드]
                    setattr(db_record, "eta", block_data.get("eta")) # [추가된 핵심 코드]
                    
                    if block_data.get("pax_ttl"): setattr(db_record, "pax_ttl", clean_int(block_data.get("pax_ttl")))
                    if block_data.get("pax_conf"): setattr(db_record, "pax_conf", clean_int(block_data.get("pax_conf")))
                    if block_data.get("payload"): setattr(db_record, "payload", clean_int(block_data.get("payload")))
                    if block_data.get("cargo_weight"): setattr(db_record, "cargo_weight", clean_int(block_data.get("cargo_weight")))
                    
                    if block_data.get("ezfw"): setattr(db_record, "ezfw", clean_int(block_data.get("ezfw")))
                    if block_data.get("mzfw"): setattr(db_record, "mzfw", clean_int(block_data.get("mzfw")))
                    if block_data.get("etow"): setattr(db_record, "etow", clean_int(block_data.get("etow")))
                    if block_data.get("mtow"): setattr(db_record, "mtow", clean_int(block_data.get("mtow")))
                    if block_data.get("eldw"): setattr(db_record, "eldw", clean_int(block_data.get("eldw")))
                    if block_data.get("mldw"): setattr(db_record, "mldw", clean_int(block_data.get("mldw")))
                    
                    if block_data.get("trip_fuel"): setattr(db_record, "trip_fuel", clean_int(block_data.get("trip_fuel")))
                    if block_data.get("cont_fuel"): setattr(db_record, "cont_fuel", clean_int(block_data.get("cont_fuel")))
                    if block_data.get("altn_fuel"): setattr(db_record, "altn_fuel", clean_int(block_data.get("altn_fuel")))
                    if block_data.get("frsv_fuel"): setattr(db_record, "frsv_fuel", clean_int(block_data.get("frsv_fuel")))
                    if block_data.get("addi_fuel"): setattr(db_record, "addi_fuel", clean_int(block_data.get("addi_fuel")))
                    if block_data.get("taxi_fuel"): setattr(db_record, "taxi_fuel", clean_int(block_data.get("taxi_fuel")))
                    if block_data.get("reqf_fuel"): setattr(db_record, "reqf_fuel", clean_int(block_data.get("reqf_fuel")))
                    if block_data.get("extra_fuel"): setattr(db_record, "extra_fuel", clean_int(block_data.get("extra_fuel")))
                    if block_data.get("extra_time"): setattr(db_record, "extra_time", block_data.get("extra_time"))
                    if block_data.get("extra_reason"): setattr(db_record, "extra_reason", block_data.get("extra_reason"))
                    if block_data.get("ccf_fuel"): setattr(db_record, "ccf_fuel", clean_int(block_data.get("ccf_fuel")))
                    if block_data.get("tank_fuel"): setattr(db_record, "tank_fuel", clean_int(block_data.get("tank_fuel")))
                    if block_data.get("ramp_fuel"): setattr(db_record, "ramp_fuel", clean_int(block_data.get("ramp_fuel")))
                    if block_data.get("min_rsv"): setattr(db_record, "min_rsv", clean_int(block_data.get("min_rsv")))
                    
                    if block_data.get("apms"): setattr(db_record, "apms", clean_float(block_data.get("apms")))
                    if block_data.get("cost_index"): setattr(db_record, "cost_index", clean_int(block_data.get("cost_index")))
                    if block_data.get("computed_time"): setattr(db_record, "computed_time", block_data.get("computed_time"))
                    if block_data.get("pln_fl"): setattr(db_record, "pln_fl", block_data.get("pln_fl"))
                    if block_data.get("dist_nam"): setattr(db_record, "dist_nam", block_data.get("dist_nam"))
                    if block_data.get("wind_temp"): setattr(db_record, "wind_temp", block_data.get("wind_temp"))
                    if block_data.get("tkof_altn"): setattr(db_record, "tkof_altn", block_data.get("tkof_altn"))
                    if block_data.get("route_str"): setattr(db_record, "route_str", block_data.get("route_str"))
                    
                    if block_data.get("dispatcher"): setattr(db_record, "dispatcher", block_data.get("dispatcher"))
                    if block_data.get("pic"): setattr(db_record, "pic", block_data.get("pic"))
                    
                    if block_data.get("mel_cdl"): setattr(db_record, "mel_cdl", block_data.get("mel_cdl"))
                    if block_data.get("special_info"): setattr(db_record, "special_info", block_data.get("special_info"))
                    if block_data.get("ops_impacts"): setattr(db_record, "ops_impacts", block_data.get("ops_impacts"))
                    if block_data.get("alternates"): setattr(db_record, "alternates", block_data.get("alternates"))
                    if block_data.get("icao_fpl"): setattr(db_record, "icao_fpl", block_data.get("icao_fpl"))
                    if block_data.get("route_data") is not None: setattr(db_record, "route_data", block_data.get("route_data"))
                    if block_data.get("tankering_data"): setattr(db_record, "tankering_data", block_data.get("tankering_data"))
                    
                    if block_data.get("trip_time"): setattr(db_record, "trip_time", block_data.get("trip_time"))
                    if block_data.get("cont_time"): setattr(db_record, "cont_time", block_data.get("cont_time"))
                    if block_data.get("altn_time"): setattr(db_record, "altn_time", block_data.get("altn_time"))
                    if block_data.get("frsv_time"): setattr(db_record, "frsv_time", block_data.get("frsv_time"))
                    if block_data.get("addi_time"): setattr(db_record, "addi_time", block_data.get("addi_time"))
                    if block_data.get("reqf_time"): setattr(db_record, "reqf_time", block_data.get("reqf_time"))
                    if block_data.get("extra_time"): setattr(db_record, "extra_time", block_data.get("extra_time"))
                    if block_data.get("ccf_time"): setattr(db_record, "ccf_time", block_data.get("ccf_time"))
                    if block_data.get("tank_time"): setattr(db_record, "tank_time", block_data.get("tank_time"))
                    if block_data.get("ramp_time"): setattr(db_record, "ramp_time", block_data.get("ramp_time"))
                    if block_data.get("min_rsv_time"): setattr(db_record, "min_rsv_time", block_data.get("min_rsv_time"))
                    if block_data.get("efob"): setattr(db_record, "efob", clean_int(block_data.get("efob")))
                    if block_data.get("efob_time"): setattr(db_record, "efob_time", block_data.get("efob_time"))
                    
                    if block_data.get("dow"): setattr(db_record, "dow", clean_int(block_data.get("dow")))
                    if block_data.get("agtow"): setattr(db_record, "agtow", clean_int(block_data.get("agtow")))
                    if block_data.get("tcap"): setattr(db_record, "tcap", clean_int(block_data.get("tcap")))
                
                    setattr(db_record, "is_revision", subject_meta.get("is_revision", False))
                    if subject_meta.get("revision_type"): setattr(db_record, "revision_type", subject_meta.get("revision_type"))
                    if subject_meta.get("raw_subject"): setattr(db_record, "raw_subject", subject_meta.get("raw_subject"))
                    
                    date_str_val = block_data.get("date")
                    if flight_number and date_str_val:
                        from backend.data_sources.common.models import MasterFlight
                        master_date = _get_zulu_date_from_ofp(str(date_str_val))
                        master_id = f"{master_date}_{flight_number}"
                        
                        master_record: Any = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                        if not master_record:
                            master_record = MasterFlight(
                                id=master_id,
                                flight_date_z=master_date,
                                flight_number=flight_number
                            )
                            db.add(master_record)
                        
                        reg_val = block_data.get("aircraft_reg")
                        dep_val = block_data.get("dep_airport")
                        arr_val = block_data.get("arr_airport")
                        std_val = block_data.get("std")
                        sta_val = block_data.get("sta")
                        etd_val = block_data.get("etd") # [추가된 핵심 코드]
                        eta_val = block_data.get("eta") # [추가된 핵심 코드]
                        
                        if reg_val: setattr(master_record, "aircraft_reg", str(reg_val))
                        if dep_val: setattr(master_record, "dep_airport", str(dep_val))
                        if arr_val: setattr(master_record, "arr_airport", str(arr_val))
                        if std_val: setattr(master_record, "std_z", str(std_val))
                        if sta_val: setattr(master_record, "sta_z", str(sta_val))
                        if etd_val: setattr(master_record, "etd_z", str(etd_val)) # [추가된 핵심 코드]
                        if eta_val: setattr(master_record, "eta_z", str(eta_val)) # [추가된 핵심 코드]
                        
                        setattr(db_record, "flight_id", master_id)
                        
                    db.commit()
                
                data = {
                    "parsed_subject_list": parsed_subject_list,
                    "pdf_filename": item["pdf_filename"],
                    "parsed_pdf_data": parsed_blocks
                }
                response_data.append(data)
            except Exception as e:
                logger.error(f"Error processing OFP record: {e}")
                db.rollback()
            
        if int(highest_uid) > last_uid:
            if sync_state is None:
                sync_state = SyncState(id="ofp_email_uid")
                setattr(sync_state, "last_value", int(highest_uid))
                db.add(sync_state)
            else:
                setattr(sync_state, "last_value", int(highest_uid))
            db.commit()
            
    except Exception as e:
        logger.error(f"Failed to run OFP fetch job: {e}")
        return {
            "error": str(e)
        }
    finally:
        if close_db:
            db.close()
        sync_lock.release()

    return {
        "count": len(results),
        "data": response_data
    }

from fastapi.encoders import jsonable_encoder

@router.get("/flight/{flight_id}")
def get_ofp_by_flight_id(flight_id: str, db: Session = Depends(get_db)):
    record = db.query(Ofp).filter(Ofp.flight_id == flight_id).order_by(Ofp.id.desc()).first()
    if not record:
        raise HTTPException(status_code=404, detail="OFP not found for this flight")
    
    # Use jsonable_encoder to handle datetime fields automatically
    data = jsonable_encoder(record)
    
    from backend.data_sources.common.models import MasterFlight
    flight = db.query(MasterFlight).filter(MasterFlight.id == flight_id).first()
    if flight:
        data['actual_pax_adult'] = flight.pax_adult
        data['actual_pax_infant'] = flight.pax_infant
        data['dla_code'] = flight.dla_code
        data['actual_out'] = flight.out_time_z
        data['actual_off'] = flight.off_time_z
        data['actual_on'] = flight.on_time_z
        data['actual_in'] = flight.in_time_z
        
    return data