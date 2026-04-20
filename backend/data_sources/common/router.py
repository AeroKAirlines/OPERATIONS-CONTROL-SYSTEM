from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.data_sources.common.models import MasterFlight
from datetime import datetime, timedelta

router = APIRouter()

@router.get("/master-schedule")
def get_master_schedule(db: Session = Depends(get_db), limit: int = 1500):
    """
    Retrieve the unified global flight schedule.
    This provides a comprehensive view across OFP, ACARS, and RAMP.
    """
    # joinedload 제거하고 그냥 조회하도록 변경
    records = db.query(MasterFlight).order_by(MasterFlight.flight_date_z.desc(), MasterFlight.id.desc()).limit(limit).all()
    
    # Filter: STD -3 hours ~ STA/ETA +1 hour
    now_utc = datetime.utcnow()
    filtered = []
    
    for r in records:
        try:
            if not r.flight_date_z or not r.std_z:
                continue
                
            std_z_clean = r.std_z.replace(":", "").replace("Z", "").replace("z", "")
            if len(std_z_clean) != 4:
                continue
                
            std_dt = datetime.strptime(f"{r.flight_date_z} {std_z_clean}", "%Y-%m-%d %H%M")
            sta_dt = std_dt + timedelta(hours=2) # Default if STA is missing
            
            if r.sta_z:
                sta_z_clean = r.sta_z.replace(":", "").replace("Z", "").replace("z", "")
                if len(sta_z_clean) == 4:
                    arr_date = r.flight_date_z
                    if int(sta_z_clean) < int(std_z_clean) and int(std_z_clean) >= 1200:
                        arr_date = (datetime.strptime(r.flight_date_z, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                    sta_dt = datetime.strptime(f"{arr_date} {sta_z_clean}", "%Y-%m-%d %H%M")

            # Adjust ETA if out_time is delayed
            eta_dt = sta_dt
            if r.eta_z:
                # If we have eta_z from ACARS/OFP, use it
                eta_z_clean = r.eta_z.replace(":", "").replace("Z", "").replace("z", "")
                if len(eta_z_clean) == 4:
                    eta_date = r.flight_date_z
                    if int(eta_z_clean) < int(std_z_clean) and int(std_z_clean) >= 2000 and int(eta_z_clean) <= 400:
                        eta_date = (datetime.strptime(r.flight_date_z, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                    eta_dt = datetime.strptime(f"{eta_date} {eta_z_clean}", "%Y-%m-%d %H%M")
            elif r.out_time_z:
                out_z_clean = r.out_time_z.replace(":", "").replace("Z", "").replace("z", "")
                if len(out_z_clean) == 4:
                    out_date = r.flight_date_z
                    if int(out_z_clean) < int(std_z_clean) and int(std_z_clean) >= 2000 and int(out_z_clean) <= 400:
                        out_date = (datetime.strptime(r.flight_date_z, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                    out_dt = datetime.strptime(f"{out_date} {out_z_clean}", "%Y-%m-%d %H%M")
                    
                    if out_dt > std_dt:
                        delay = out_dt - std_dt
                        eta_dt = sta_dt + delay

            # Ghost Airborne fix
            is_really_arrived = False
            if r.status in ["AIRBORNE", "DEPARTED"] and not r.in_time_z and not r.on_time_z:
                if now_utc > eta_dt + timedelta(minutes=30):
                    from backend.data_sources.acars.models import PositionReport
                    last_pos = db.query(PositionReport).filter(PositionReport.flight_id == r.id).order_by(PositionReport.id.desc()).first()
                    
                    is_really_arrived = True
                    if last_pos and last_pos.created_at:
                        if now_utc < last_pos.created_at + timedelta(minutes=30):
                            # It's still sending positions
                            is_really_arrived = False
                            
                    if is_really_arrived:
                        r.status = "ARRIVED"

            # 백엔드에서는 넉넉하게 -25시간 ~ +8시간의 데이터를 보내주고, 실제 표출은 프론트엔드에서 제어하도록 변경
            start_window = std_dt - timedelta(hours=8)
            end_window = std_dt + timedelta(hours=25)
            
            if start_window <= now_utc <= end_window:
                filtered.append(r)
            if r.status in ["AIRBORNE", "DEPARTED"]:
                # Basic check, use out_time_z (ATD) or std_z to determine
                ref_dt = None
                if r.out_time_z:
                    out_z_clean = r.out_time_z.replace(":", "").replace("Z", "").replace("z", "")
                    if len(out_z_clean) == 4:
                        out_date = r.flight_date_z
                        if int(out_z_clean) < int(std_z_clean) and int(std_z_clean) >= 2000 and int(out_z_clean) <= 400:
                            out_date = (datetime.strptime(r.flight_date_z, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                        ref_dt = datetime.strptime(f"{out_date} {out_z_clean}", "%Y-%m-%d %H%M")
                
                if not ref_dt:
                    ref_dt = std_dt
                    
                if is_really_arrived and now_utc > eta_dt + timedelta(minutes=30):
                    pass # Or just include them but they show as ARRIVED now
                    if r not in filtered:
                        filtered.append(r)
                else:
                    if r not in filtered:
                        filtered.append(r)
        except Exception:
            continue
            
    # Sort the filtered list by STD before returning
    def get_sort_key(x):
        try:
            return x.flight_date_z + x.std_z.replace(":", "").replace("Z", "").replace("z", "")
        except:
            return "9999"
            
    filtered.sort(key=get_sort_key)
    
    response = []
    for r in filtered:
        rd_dict = {
            "id": r.id,
            "flight_number": r.flight_number,
            "flight_date_z": r.flight_date_z,
            "aircraft_reg": r.aircraft_reg,
            "dep_airport": r.dep_airport,
            "arr_airport": r.arr_airport,
            "std_z": r.std_z,
            "sta_z": r.sta_z,
            "etd_z": getattr(r, "etd_z", None),
            "out_time_z": r.out_time_z,
            "off_time_z": r.off_time_z,
            "on_time_z": r.on_time_z,
            "in_time_z": r.in_time_z,
            "eta_z": r.eta_z,
            "status": r.status,
            "ofp_data": None
        }
        
        # Look for OFP data linked to this flight
        from backend.data_sources.ofp.models import Ofp
        ofp = db.query(Ofp).filter(Ofp.flight_id == r.id).order_by(Ofp.id.desc()).first()
        if ofp:
            rd_dict["ofp_data"] = {
                "route_data": ofp.route_data
            }
            
        response.append(rd_dict)
        
    return response

@router.get("/daily-stats")
def get_daily_stats(db: Session = Depends(get_db)):
    """
    Calculate TOTAL (15Z-15Z), AIRBORNE, SCHEDULED, DLY.
    For simplicity, fetches today's flights (from 15Z yesterday to 15Z today, based on current UTC time)
    """
    now_utc = datetime.utcnow()
    # Define the 15Z-15Z window
    if now_utc.hour >= 15:
        start_time = now_utc.replace(hour=15, minute=0, second=0, microsecond=0)
        end_time = start_time + timedelta(days=1)
    else:
        end_time = now_utc.replace(hour=15, minute=0, second=0, microsecond=0)
        start_time = end_time - timedelta(days=1)

    records = db.query(MasterFlight).order_by(MasterFlight.id.desc()).limit(1000).all()
    
    total = 0
    airborne = 0
    scheduled = 0
    delayed = 0

    for r in records:
        try:
            if not r.flight_date_z or not r.std_z:
                continue
                
            std_z_clean = r.std_z.replace(":", "").replace("Z", "").replace("z", "")
            if len(std_z_clean) != 4:
                continue
                
            std_dt = datetime.strptime(f"{r.flight_date_z} {std_z_clean}", "%Y-%m-%d %H%M")
            
            # Check if within 15Z-15Z window
            if start_time <= std_dt < end_time:
                total += 1
                
                if r.status in ["AIRBORNE", "DEPARTED"]:
                    airborne += 1
                elif r.status == "SCHED":
                    scheduled += 1
                
                # Delay calculation
                if r.out_time_z:
                    out_z_clean = r.out_time_z.replace(":", "").replace("Z", "").replace("z", "")
                    if len(out_z_clean) == 4:
                        out_date = r.flight_date_z
                        if int(out_z_clean) < int(std_z_clean) and int(std_z_clean) >= 2000 and int(out_z_clean) <= 400:
                            out_date = (datetime.strptime(r.flight_date_z, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                        out_dt = datetime.strptime(f"{out_date} {out_z_clean}", "%Y-%m-%d %H%M")
                        
                        if (out_dt - std_dt).total_seconds() >= 15 * 60:
                            delayed += 1
        except Exception:
            continue
            
    return {
        "total": total,
        "airborne": airborne,
        "scheduled": scheduled,
        "delayed": delayed
    }

