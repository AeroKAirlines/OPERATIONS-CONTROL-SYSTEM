from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from typing import Any
import logging
from backend.core.database import get_db, sync_lock
from backend.data_sources.acars.fetcher import fetch_acars_emails
from backend.data_sources.acars.models import PositionReport, Movement, CfdMessage
from backend.data_sources.common.models import MasterFlight
import json
import re
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

router = APIRouter()

ICAO_TO_IATA = {
    "RKTU": "CJJ", "RKSI": "ICN", "RKPC": "CJU",
    "RJBB": "KIX", "RJAA": "NRT", "RJFF": "FUK",
    "RJCC": "CTS", "RJGG": "NGO", "ROAH": "OKA",
    "RJAH": "IBR", "RJCB": "OBO", "RJFR": "KKJ",
    "RJOA": "HIJ", "RCTP": "TPE", "ZMCK": "UBN"
}

def parse_route_to_iata(route_str):
    if not route_str: return None, None
    parts = route_str.split('/')
    if len(parts) == 2:
        dep = parts[0].strip().upper()
        arr = parts[1].strip().upper()
        return ICAO_TO_IATA.get(dep, dep), ICAO_TO_IATA.get(arr, arr)
    return None, None


_is_first_acars_run = True

def _extract_flight_number_from_subject(subject: str) -> str:
    if not subject:
        return ""
    # Try to find RF followed by numbers or something similar
    match = re.search(r'RF\s*([A-Z0-9]+)', subject, re.IGNORECASE)
    if match:
        extracted = match.group(1).strip()
        if extracted.isdigit():
            return f"EOK{extracted}"
        return extracted
    return ""

def _get_flight_datetime(report_time: str) -> datetime | None:
    if not report_time:
        return None
    parts = report_time.split("/")
    if len(parts) == 2:
        day = parts[1]
        now_utc = datetime.utcnow()
        
        try:
            day_int = int(day)
            try:
                report_hour = int(parts[0][:2])
                report_minute = int(parts[0][2:4])
                if not (0 <= report_hour <= 23) or not (0 <= report_minute <= 59):
                    raise ValueError("Invalid time")
            except (ValueError, IndexError):
                report_hour = 0
                report_minute = 0
            
            report_dt_utc = datetime(now_utc.year, now_utc.month, day_int, report_hour, report_minute)
            
            # 월이 넘어갈 때의 날짜 계산 방어 로직
            if now_utc.day < 5 and day_int > 25:
                report_dt_utc = report_dt_utc - timedelta(days=20)
                report_dt_utc = report_dt_utc.replace(day=day_int)
            elif now_utc.day > 25 and day_int < 5:
                report_dt_utc = report_dt_utc + timedelta(days=20)
                report_dt_utc = report_dt_utc.replace(day=day_int)
            
            return report_dt_utc
            
        except Exception as e:
            logger.error(f"Error parsing date from {report_time}: {e}")
            return None
            
    return None

def _resolve_master_flight_date(db: Session, flight_num: str, report_dt: datetime | None, msg_type: str) -> str:
    """[자정 크로스오버 & 중복 방지 - 12시간 룰 적용]
    수신된 메시지의 시간이 해당 비행편의 출발 시간으로부터 -4시간 ~ +12시간 이내일 때만 연결합니다.
    """
    if not report_dt:
        return datetime.utcnow().strftime("%Y-%m-%d")
        
    report_date_str = report_dt.strftime("%Y-%m-%d")
    if not flight_num:
        return report_date_str
        
    try:
        # 이틀 전부터 오늘까지의 비행편 검색 (여유롭게 D-1, D, D+1 검색)
        start_date = (report_dt - timedelta(days=1)).strftime("%Y-%m-%d")
        end_date = (report_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        
        candidates = db.query(MasterFlight).filter(
            MasterFlight.flight_number == flight_num,
            MasterFlight.flight_date_z >= start_date,
            MasterFlight.flight_date_z <= end_date
        ).all()
        
        if not candidates:
            return report_date_str

        valid_candidates = []
        for mf in candidates:
            # 비교를 위한 출발 기준 시간 도출 (실제 출발 시간 우선, 없으면 스케줄 시간)
            ref_time_str = getattr(mf, "std_z", None) or getattr(mf, "out_time_z", None) or getattr(mf, "off_time_z", None)
            
            if ref_time_str and len(ref_time_str) >= 4:
                try:
                    mf_start_dt = datetime.strptime(f"{mf.flight_date_z} {ref_time_str[:4]}", "%Y-%m-%d %H%M")
                except ValueError:
                    mf_start_dt = datetime.strptime(f"{mf.flight_date_z} 2359", "%Y-%m-%d %H%M")
            else:
                # 단서가 전혀 없으면 보수적으로 해당일 23:59으로 잡음
                mf_start_dt = datetime.strptime(f"{mf.flight_date_z} 2359", "%Y-%m-%d %H%M")
            
            diff_seconds = (report_dt - mf_start_dt).total_seconds()
            
            # [핵심] 메시지 시간이 기준 시간으로부터 -2시간(일찍 출발) ~ +22시간(최대 지연 허용치) 이내인지 검사
            if -7200 <= diff_seconds <= 79200:
                valid_candidates.append((mf, abs(diff_seconds)))

        if not valid_candidates:
            # 스케줄이 아직 없더라도, ACARS보다 먼저 수신되는 OFP(비행계획서)가 있다면 그 날짜를 따라감.
            try:
                from backend.data_sources.ofp.models import Ofp
                ofp_candidate = db.query(Ofp).filter(
                    Ofp.flight_id.like(f"%_{flight_num}")
                ).order_by(Ofp.created_at.desc()).first()
                
                if ofp_candidate and ofp_candidate.flight_id:
                    ofp_date = ofp_candidate.flight_id.split("_")[0]
                    # OFP 날짜와 수신 시간의 차이가 24시간 이내일 때만 신뢰
                    ofp_dt = datetime.strptime(ofp_date, "%Y-%m-%d")
                    if abs((report_dt - ofp_dt).total_seconds()) < 86400:
                        return ofp_date
            except Exception:
                pass
                
            return report_date_str
            
        # 가장 가까운 출발 시간을 가진 비행편 순으로 정렬 (12:00 기준이 아닌 실제 출발시간 기준)
        valid_candidates.sort(key=lambda x: x[1])
        valid_mfs = [x[0] for x in valid_candidates]
        
        if msg_type in ["OUTRP", "OFFRP"]:
            # 출발 메시지는 SCHED(대기중) 상태를 선호
            for mf in valid_mfs:
                if getattr(mf, "status", None) in [None, "SCHED"]:
                    return mf.flight_date_z
            return valid_mfs[0].flight_date_z
        else:
            # POSRPT, ON, IN 메시지는 이미 출발했거나 도착한 비행(DEPARTED/AIRBORNE/LANDED/ARRIVED)을 선호
            for mf in valid_mfs:
                if getattr(mf, "status", None) in ["DEPARTED", "AIRBORNE", "LANDED", "ARRIVED"]:
                    return mf.flight_date_z
            # 진행중인게 없으면 스케줄 된 것에 연결
            for mf in valid_mfs:
                if getattr(mf, "status", None) in [None, "SCHED"]:
                    return mf.flight_date_z
                    
            return valid_mfs[0].flight_date_z
            
    except Exception as e:
        logger.error(f"Error resolving master flight date: {e}")
        return report_date_str

def run_acars_fetch_job(limit: int = 15, db: Any = None, since_days: int = 0):
    global _is_first_acars_run
    
    sync_lock.acquire()
    close_db = False
    try:
        if db is None:
            db = next(get_db())
            close_db = True
            
        from backend.data_sources.common.models import SyncState
        sync_state = None
        if hasattr(db, 'query'):
            sync_state = db.query(SyncState).filter(SyncState.id == "acars_email_uid").first()
        last_uid = 0
        if sync_state and getattr(sync_state, "last_value", None) is not None:
            last_uid = int(str(getattr(sync_state, "last_value")))
        
        effective_last_uid = 0 if since_days > 0 else last_uid
        
        logger.info(f"Running ACARS fetch job (last_uid: {effective_last_uid}, fallback limit: {limit}, since_days: {since_days}).")
        
        if _is_first_acars_run:
            logger.info("서버 기동 후 ACARS 이메일 동기화를 시작합니다. 밀린 메일을 가져오는 데 시간이 조금 걸릴 수 있습니다...")
            _is_first_acars_run = False
        elif effective_last_uid == 0:
            logger.info("Starting initial ACARS email sync. This may take a moment...")
            
        results, highest_uid = fetch_acars_emails(last_uid=effective_last_uid, limit=limit, since_days=since_days)
        
        if not results:
            if effective_last_uid == 0:
                logger.info("Initial ACARS sync complete. No new emails found.")
            else:
                logger.info("No new ACARS emails found.")
            if int(highest_uid) > last_uid:
                if sync_state is None:
                    sync_state = SyncState(id="acars_email_uid")
                    setattr(sync_state, "last_value", int(highest_uid))
                    db.add(sync_state)
                else:
                    setattr(sync_state, "last_value", int(highest_uid))
                db.commit()
            return

        total_items = len(results)
        print(f"\n[ACARS Sync] {total_items} messages found. Updating DB...")

        for idx, item in enumerate(results):
            if not isinstance(item, dict):
                continue
            
            if total_items > 5:
                progress = (idx + 1) / total_items * 100
                if (idx + 1) % max(1, int(total_items/10)) == 0 or (idx+1) == total_items:
                    print(f"  > ACARS Progress: {progress:3.0f}% ({idx + 1}/{total_items})", end="\r")

            try:
                msg_type = str(item.get("msg_type"))
                reg = item.get("aircraft_reg")
                report_time = item.get("report_time")
                raw_subj = item.get("raw_subject", "")
                
                flight_num = item.get("flight_number") or _extract_flight_number_from_subject(str(raw_subj))
                
                report_dt = _get_flight_datetime(str(report_time) if report_time else "")
                # [ACARS Dummy Flight Auto-Correct]
                if flight_num and flight_num.lower() in ("rf0", "eok0", "rf123", "eok123", "eok000", "rf000"):
                    corrected = False
                    dep_iata, arr_iata = parse_route_to_iata(item.get("route"))
                    if dep_iata and arr_iata and reg and report_dt:
                        start_date = (report_dt - timedelta(days=1)).strftime("%Y-%m-%d")
                        end_date = (report_dt + timedelta(days=1)).strftime("%Y-%m-%d")
                        sched_candidates = db.query(MasterFlight).filter(
                            MasterFlight.aircraft_reg == reg,
                            MasterFlight.dep_airport == dep_iata,
                            MasterFlight.arr_airport == arr_iata,
                            MasterFlight.flight_date_z >= start_date,
                            MasterFlight.flight_date_z <= end_date
                        ).all()
                        best_match = None
                        min_diff = 10800 # 3 hours
                        for sc in sched_candidates:
                            ref_str = getattr(sc, "std_z", None)
                            if ref_str and len(ref_str) >= 4:
                                try:
                                    sc_dt = datetime.strptime(f"{sc.flight_date_z} {ref_str[:4]}", "%Y-%m-%d %H%M")
                                    diff = abs((report_dt - sc_dt).total_seconds())
                                    if diff < min_diff:
                                        min_diff = diff
                                        best_match = sc.flight_number
                                except: pass
                        if best_match:
                            logger.info(f"Auto-corrected dummy flight {flight_num} to {best_match}")
                            flight_num = best_match
                            corrected = True
                    if not corrected and flight_num.lower() in ("rf0", "eok0"):
                        continue

                if not flight_num:
                    flight_num = f"UNK_{reg}" if reg else "UNKNOWN"
                
                # [ACARS Early Flight Number Fix]
                # Pilots often enter the next flight number in the FMS during descent or taxi-in.
                # If we get a POSRPT, ONRP, INRP, or ETA for a flight that isn't active,
                # but the aircraft has another currently active flight (DEPARTED/AIRBORNE/LANDED),
                # we re-route the message to the active flight.
                if reg and flight_num and not flight_num.startswith("UNK_") and msg_type in ["POSRPT", "ONRP", "INRP", "ETA"]:
                    active_mf = db.query(MasterFlight).filter(
                        MasterFlight.aircraft_reg == reg,
                        MasterFlight.status.in_(["DEPARTED", "AIRBORNE", "LANDED"])
                    ).order_by(MasterFlight.flight_date_z.desc(), MasterFlight.id.desc()).first()
                    
                    if active_mf and active_mf.flight_number != flight_num:
                        is_reported_active = db.query(MasterFlight).filter(
                            MasterFlight.flight_number == flight_num,
                            MasterFlight.flight_date_z >= (datetime.utcnow() - timedelta(days=2)).strftime("%Y-%m-%d"),
                            MasterFlight.status.in_(["DEPARTED", "AIRBORNE", "LANDED"])
                        ).first()
                        
                        if not is_reported_active:
                            logger.info(f"Re-routing ACARS {msg_type} from {flight_num} to active flight {active_mf.flight_number}")
                            flight_num = active_mf.flight_number

                flight_date = _resolve_master_flight_date(db, flight_num, report_dt, msg_type)
                
                if msg_type == "POSRPT":
                    master_id = f"{flight_date}_{flight_num}"
                    
                    master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                    if not master_record:
                        dep_iata, arr_iata = parse_route_to_iata(item.get('route'))
                        master_record = MasterFlight(
                            id=master_id,
                            flight_date_z=flight_date,
                            flight_number=flight_num,
                            aircraft_reg=reg,
                            dep_airport=dep_iata,
                            arr_airport=arr_iata
                        )
                        db.add(master_record)
                        db.flush()
                    
                    existing_pos = db.query(PositionReport).filter(
                        PositionReport.flight_id == master_id,
                        PositionReport.report_time == report_time
                    ).first()
                    
                    if not existing_pos:
                        pos_record = PositionReport(
                            flight_id=master_id,
                            flight_number=flight_num,
                            aircraft_reg=reg,
                            report_time=report_time,
                            lat=item.get("lat"),
                            lon=item.get("lon"),
                            alt=item.get("alt"),
                            mch=item.get("mch"),
                            fob=item.get("fob"),
                            eta=item.get("eta"),
                            raw_message=item.get("raw_message")
                        )
                        db.add(pos_record)
                        db.flush()
                        
                        master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                        if master_record:
                            if item.get("eta"):
                                master_record.eta_z = str(item.get("eta"))
                            if getattr(master_record, "status") in[None, "SCHED", "DEPARTED"]:
                                master_record.status = "AIRBORNE"
                
                elif msg_type == "CFD":
                    master_id = f"{flight_date}_{flight_num}"
                    
                    master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                    if not master_record:
                        master_record = MasterFlight(
                            id=master_id,
                            flight_date_z=flight_date,
                            flight_number=flight_num,
                            aircraft_reg=reg
                        )
                        db.add(master_record)
                        db.flush()
                        
                    existing_cfd = db.query(CfdMessage).filter(
                        CfdMessage.flight_id == master_id,
                        CfdMessage.report_time == report_time,
                        CfdMessage.fault_code == item.get("fault_code")
                    ).first()
                    
                    if not existing_cfd:
                        cfd_record = CfdMessage(
                            flight_id=master_id,
                            flight_number=flight_num,
                            aircraft_reg=reg,
                            report_time=report_time,
                            fault_code=item.get("fault_code"),
                            fault_desc=item.get("fault_desc"),
                            raw_message=item.get("raw_message")
                        )
                        db.add(cfd_record)
                        db.flush()

                elif msg_type in ["OUTRP", "OFFRP", "ONRP", "INRP", "ETA"]:
                    oooi_record = db.query(Movement).filter(
                        Movement.flight_number == flight_num,
                        Movement.flight_date == flight_date,
                        Movement.aircraft_reg == reg
                    ).first()
                    
                    if not oooi_record:
                        oooi_record = Movement(
                            flight_id=f"{flight_date}_{flight_num}",
                            flight_number=flight_num,
                            flight_date=flight_date,
                            aircraft_reg=reg,
                            raw_messages={}
                        )
                        db.add(oooi_record)
                        db.flush()
                    master_id = f"{flight_date}_{flight_num}"
                    master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                    if not master_record:
                        dep_iata, arr_iata = parse_route_to_iata(item.get("route"))
                        master_record = MasterFlight(
                            id=master_id,
                            flight_date_z=flight_date,
                            flight_number=flight_num,
                            aircraft_reg=reg,
                            dep_airport=dep_iata,
                            arr_airport=arr_iata
                        )
                        db.add(master_record)
                        db.flush()
                    else:
                        if reg: setattr(master_record, "aircraft_reg", reg)

                    current_off = getattr(oooi_record, "off_time") or getattr(master_record, "off_time_z")
                    current_on  = getattr(oooi_record, "on_time") or getattr(master_record, "on_time_z")
                    current_in  = getattr(oooi_record, "in_time") or getattr(master_record, "in_time_z")

                    can_update_out = not bool(current_off)
                    can_update_off = not bool(current_on)
                    can_update_on  = not bool(current_in)

                    if item.get("out_time") and can_update_out:
                        setattr(oooi_record, "out_time", str(item.get("out_time")))
                    if msg_type == "OUTRP" and item.get("fob") and can_update_out:
                        setattr(oooi_record, "out_fob", str(item.get("fob")))

                    if item.get("off_time") and can_update_off:
                        setattr(oooi_record, "off_time", str(item.get("off_time")))
                    if msg_type == "OFFRP" and item.get("fob") and can_update_off:
                        setattr(oooi_record, "off_fob", str(item.get("fob")))

                    if item.get("on_time") and can_update_on:
                        setattr(oooi_record, "on_time", str(item.get("on_time")))
                    if msg_type == "ONRP" and item.get("fob") and can_update_on:
                        setattr(oooi_record, "on_fob", str(item.get("fob")))

                    if item.get("in_time"):
                        setattr(oooi_record, "in_time", str(item.get("in_time")))
                    if msg_type == "INRP" and item.get("fob"):
                        setattr(oooi_record, "in_fob", str(item.get("fob")))

                    if item.get("eta"):
                        setattr(oooi_record, "eta", str(item.get("eta")))
                        master_record.eta_z = str(item.get("eta"))
                    if item.get("dor"): setattr(oooi_record, "dor", str(item.get("dor")))

                    from backend.data_sources.mvt.models import LiveMVT
                    latest_mvt = db.query(LiveMVT).filter(LiveMVT.flight_id == master_id).order_by(LiveMVT.created_at.desc()).first()

                    if item.get("out_time") and can_update_out and not (latest_mvt and latest_mvt.block_off_time):
                        master_record.__setattr__("out_time_z", str(item.get("out_time")))
                    if item.get("off_time") and can_update_off and not (latest_mvt and latest_mvt.take_off_time):
                        master_record.__setattr__("off_time_z", str(item.get("off_time")))
                    if item.get("on_time") and can_update_on and not (latest_mvt and latest_mvt.touch_down_time):
                        master_record.__setattr__("on_time_z", str(item.get("on_time")))
                    if item.get("in_time") and not (latest_mvt and latest_mvt.block_in_time):
                        master_record.__setattr__("in_time_z", str(item.get("in_time")))

                    if getattr(master_record, "in_time_z"): master_record.__setattr__("status", "ARRIVED")
                    elif getattr(master_record, "on_time_z"): master_record.__setattr__("status", "LANDED")
                    elif getattr(master_record, "off_time_z"): master_record.__setattr__("status", "AIRBORNE")
                    elif getattr(master_record, "out_time_z"): master_record.__setattr__("status", "DEPARTED")

                        
                    current_msgs = getattr(oooi_record, "raw_messages")
                    raw_msgs = dict(current_msgs) if current_msgs is not None else {}
                    raw_msgs[str(msg_type)] = item.get("raw_message")
                    setattr(oooi_record, "raw_messages", raw_msgs)
            except Exception as e:
                logger.error(f"Error processing ACARS record: {e}")
                db.rollback()
                
        if int(highest_uid) > last_uid:
            if sync_state is None:
                sync_state = SyncState(id="acars_email_uid")
                setattr(sync_state, "last_value", int(highest_uid))
                db.add(sync_state)
            else:
                setattr(sync_state, "last_value", int(highest_uid))
                
        db.commit()
        print(f"\n  > ACARS Sync Complete: 100% ({total_items}/{total_items})")
    except Exception as e:
        logger.error(f"Error in ACARS fetch job: {e}")
        db.rollback()
    finally:
        if close_db:
            db.close()
        sync_lock.release()

@router.get("/test-fetch")
def test_fetch_acars_emails(limit: int = 10, db: Session = Depends(get_db)):
    """
    Fetch latest ACARS emails, parse them using slash strategy, and insert into DB.
    """
    logger.info(f"Testing ACARS email fetch for the latest {limit} emails.")
    results, highest_uid = fetch_acars_emails(last_uid=0, limit=limit)
    
    if not results:
        return {"message": "No ACARS emails found or failed to fetch."}
    
    response_data =[]
    
    for item in results:
        msg_type = str(item.get("msg_type"))
        reg = item.get("aircraft_reg")
        report_time = item.get("report_time")
        raw_subj = item.get("raw_subject", "")
        
        flight_num = item.get("flight_number") or _extract_flight_number_from_subject(str(raw_subj))
        
        if flight_num and flight_num.lower() in ("rf0", "eok0"):
            continue

        if not flight_num:
            flight_num = f"UNK_{reg}" if reg else "UNKNOWN"

        report_dt = _get_flight_datetime(str(report_time) if report_time else "")

        # [ACARS Early Flight Number Fix]
        if reg and flight_num and not flight_num.startswith("UNK_") and msg_type in ["POSRPT", "ONRP", "INRP", "ETA"]:
            active_mf = db.query(MasterFlight).filter(
                MasterFlight.aircraft_reg == reg,
                MasterFlight.status.in_(["DEPARTED", "AIRBORNE", "LANDED"])
            ).order_by(MasterFlight.flight_date_z.desc(), MasterFlight.id.desc()).first()
            
            if active_mf and active_mf.flight_number != flight_num:
                is_reported_active = db.query(MasterFlight).filter(
                    MasterFlight.flight_number == flight_num,
                    MasterFlight.flight_date_z >= (datetime.utcnow() - timedelta(days=2)).strftime("%Y-%m-%d"),
                    MasterFlight.status.in_(["DEPARTED", "AIRBORNE", "LANDED"])
                ).first()
                
                if not is_reported_active:
                    logger.info(f"Re-routing ACARS {msg_type} from {flight_num} to active flight {active_mf.flight_number}")
                    flight_num = active_mf.flight_number

        flight_date = _resolve_master_flight_date(db, flight_num, report_dt, msg_type)
        
        if msg_type == "POSRPT":
            master_id = f"{flight_date}_{flight_num}"
            
            existing_pos = db.query(PositionReport).filter(
                PositionReport.flight_id == master_id,
                PositionReport.report_time == report_time
            ).first()
            
            if not existing_pos:
                pos_record = PositionReport(
                    flight_id=master_id,
                    flight_number=flight_num,
                    aircraft_reg=reg,
                    report_time=report_time,
                    lat=item.get("lat"),
                    lon=item.get("lon"),
                    alt=item.get("alt"),
                    mch=item.get("mch"),
                    fob=item.get("fob"),
                    eta=item.get("eta"),
                    raw_message=item.get("raw_message")
                )
                db.add(pos_record)
                db.flush()
                
                master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                if master_record:
                    if item.get("eta"):
                        master_record.eta_z = str(item.get("eta"))
                    if getattr(master_record, "status") in [None, "SCHED", "DEPARTED"]:
                        master_record.status = "AIRBORNE"
        
        elif msg_type == "CFD":
            master_id = f"{flight_date}_{flight_num}"
            
            master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
            if not master_record:
                master_record = MasterFlight(
                    id=master_id,
                    flight_date_z=flight_date,
                    flight_number=flight_num,
                    aircraft_reg=reg
                )
                db.add(master_record)
                db.flush()
                
            existing_cfd = db.query(CfdMessage).filter(
                CfdMessage.flight_id == master_id,
                CfdMessage.report_time == report_time,
                CfdMessage.fault_code == item.get("fault_code")
            ).first()
            
            if not existing_cfd:
                cfd_record = CfdMessage(
                    flight_id=master_id,
                    flight_number=flight_num,
                    aircraft_reg=reg,
                    report_time=report_time,
                    fault_code=item.get("fault_code"),
                    fault_desc=item.get("fault_desc"),
                    raw_message=item.get("raw_message")
                )
                db.add(cfd_record)
                db.flush()

        elif msg_type in["OUTRP", "OFFRP", "ONRP", "INRP"]:
            oooi_record = db.query(Movement).filter(
                Movement.flight_number == flight_num,
                Movement.flight_date == flight_date,
                Movement.aircraft_reg == reg
            ).first()
            
            if not oooi_record:
                oooi_record = Movement(
                    flight_id=f"{flight_date}_{flight_num}",
                    flight_number=flight_num,
                    flight_date=flight_date,
                    aircraft_reg=reg,
                    raw_messages={}
                )
                db.add(oooi_record)
                db.flush()
                
                if item.get("out_time"):
                    setattr(oooi_record, "out_time", str(item.get("out_time")))
                    if item.get("fob"): setattr(oooi_record, "out_fob", str(item.get("fob")))
                if item.get("off_time"):
                    setattr(oooi_record, "off_time", str(item.get("off_time")))
                    if item.get("fob"): setattr(oooi_record, "off_fob", str(item.get("fob")))
                if item.get("on_time"):
                    setattr(oooi_record, "on_time", str(item.get("on_time")))
                    if item.get("fob"): setattr(oooi_record, "on_fob", str(item.get("fob")))
                if item.get("in_time"):
                    setattr(oooi_record, "in_time", str(item.get("in_time")))
                    if item.get("fob"): setattr(oooi_record, "in_fob", str(item.get("fob")))
                    
                master_id = f"{flight_date}_{flight_num}"
                master_record = db.query(MasterFlight).filter(MasterFlight.id == master_id).first()
                if not master_record:
                    master_record = MasterFlight(
                        id=master_id,
                        flight_date_z=flight_date,
                        flight_number=flight_num,
                        aircraft_reg=reg
                    )
                    db.add(master_record)
                    db.flush()
                else:
                    if reg: setattr(master_record, "aircraft_reg", reg)

                if item.get("eta"):
                    setattr(oooi_record, "eta", str(item.get("eta")))
                    master_record.eta_z = str(item.get("eta"))
                if item.get("dor"):
                    setattr(oooi_record, "dor", str(item.get("dor")))
                    
                from backend.data_sources.mvt.models import LiveMVT
                mvt_ad = db.query(LiveMVT).filter(LiveMVT.flight_id == master_id, LiveMVT.msg_type == "AD").order_by(LiveMVT.created_at.desc()).first()
                mvt_aa = db.query(LiveMVT).filter(LiveMVT.flight_id == master_id, LiveMVT.msg_type == "AA").order_by(LiveMVT.created_at.desc()).first()
                
                if item.get("out_time") and not (mvt_ad and mvt_ad.block_off_time):
                    master_record.__setattr__("out_time_z", str(item.get("out_time")))
                if item.get("off_time") and not (mvt_ad and mvt_ad.take_off_time):
                    master_record.__setattr__("off_time_z", str(item.get("off_time")))
                if item.get("on_time") and not (mvt_aa and mvt_aa.touch_down_time):
                    master_record.__setattr__("on_time_z", str(item.get("on_time")))
                if item.get("in_time") and not (mvt_aa and mvt_aa.block_in_time):
                    master_record.__setattr__("in_time_z", str(item.get("in_time")))
                
                if getattr(master_record, "in_time_z"): master_record.__setattr__("status", "ARRIVED")
                elif getattr(master_record, "on_time_z"): master_record.__setattr__("status", "LANDED")
                elif getattr(master_record, "off_time_z"): master_record.__setattr__("status", "AIRBORNE")
                elif getattr(master_record, "out_time_z"): master_record.__setattr__("status", "DEPARTED")
                    
                current_msgs = getattr(oooi_record, "raw_messages")
                raw_msgs = dict(current_msgs) if current_msgs is not None else {}
                raw_msgs[str(msg_type)] = item.get("raw_message")
                setattr(oooi_record, "raw_messages", raw_msgs)
            
        response_data.append(item)
            
    db.commit()
        
    return {
        "count": len(results),
        "data": response_data
    }

@router.get("/positions")
def get_acars_positions(db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    four_hours_ago = datetime.utcnow() - timedelta(hours=4)
    records = db.query(PositionReport).filter(PositionReport.created_at >= four_hours_ago).order_by(PositionReport.id.desc()).limit(1000).all()
    return records

@router.get("/oooi")
def get_flight_oooi(db: Session = Depends(get_db)):
    records = db.query(Movement).order_by(Movement.id.desc()).limit(50).all()
    return records

@router.get("/cfd")
def get_cfd_messages(db: Session = Depends(get_db)):
    from backend.data_sources.acars.models import CfdMessage
    records = db.query(CfdMessage).order_by(CfdMessage.id.desc()).limit(1000).all()
    return records