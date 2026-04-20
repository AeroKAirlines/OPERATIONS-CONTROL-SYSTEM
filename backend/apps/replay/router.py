from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Dict, Any
from backend.core.database import get_db
from backend.data_sources.common.models import MasterFlight
from backend.data_sources.acars.models import PositionReport, Movement
from backend.data_sources.ofp.models import Ofp
from datetime import datetime, timedelta

router = APIRouter()

AIRPORT_COORDS = {
    "CJJ": [36.716, 127.499], "ICN": [37.460, 126.440], "CJU": [33.511, 126.493],
    "KIX": [34.427, 135.244], "NRT": [35.764, 140.386], "FUK": [33.585, 130.450],
    "CTS": [42.775, 141.692], "NGO": [34.858, 136.805], "OKA": [26.195, 127.645],
    "IBR": [36.182, 140.413], "OBO": [42.873, 143.217], "KKJ": [33.845, 130.965],
    "HIJ": [34.436, 132.919], "TPE": [25.077, 121.232], "UBN": [47.652, 106.818]
}

def _parse_event_time(t_str, base_dt):
    if not t_str: return None
    t_clean = t_str.replace("Z", "").replace("z", "").replace(":", "").strip()
    day_str = None
    if "/" in t_clean:
        parts = t_clean.split("/")
        if len(parts) == 2:
            if len(parts[0]) <= 2:
                day_str, t_clean = parts[0], parts[1]
            elif len(parts[1]) <= 2:
                t_clean, day_str = parts[0], parts[1]
    
    hh = int(t_clean[:2]) if len(t_clean) >= 2 and t_clean[:2].isdigit() else 0
    mm = int(t_clean[2:4]) if len(t_clean) >= 4 and t_clean[2:4].isdigit() else 0
    
    dt = base_dt.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if day_str and day_str.isdigit():
        day_int = int(day_str)
        try:
            if day_int < 5 and base_dt.day > 25:
                dt = (dt + timedelta(days=15)).replace(day=day_int)
            elif day_int > 25 and base_dt.day < 5:
                dt = (dt - timedelta(days=15)).replace(day=day_int)
            else:
                dt = dt.replace(day=day_int)
        except:
            pass
    else:
        # Cross midnight check: if event is 00~06 and std is 18~23, it's next day
        if hh < 8 and base_dt.hour >= 16:
            dt += timedelta(days=1)
        # Or if event is 18~23 and std is 00~06, it's prev day
        elif hh >= 16 and base_dt.hour < 8:
            dt -= timedelta(days=1)
            
    return dt

@router.get("/search")
def search_flights(date: str, flight_number: str = None, db: Session = Depends(get_db)):
    """
    Search past flights by Date and (optional) Flight Number.
    Format: date=2026-04-19, flight_number=EOK123
    """
    query = db.query(MasterFlight)
    
    # Only return flights that have ARRIVED
    query = query.filter(MasterFlight.status == "ARRIVED")
    
    # 1. Date filter (exact match or previous day match for crossing midnights)
    if date:
        # Example: date="2026-04-19"
        query = query.filter(MasterFlight.flight_date_z == date)
        
    # 2. Flight Number filter
    if flight_number:
        # Allow partial match, e.g., "123" matches "EOK123"
        query = query.filter(MasterFlight.flight_number.like(f"%{flight_number}%"))
        
    results = query.order_by(MasterFlight.std_z.asc()).all()
    
    # Simplify output for search dropdown
    return [
        {
            "id": f.id,
            "flight_number": f.flight_number,
            "date": f.flight_date_z,
            "std": f.std_z,
            "sta": f.sta_z,
            "reg": f.aircraft_reg,
            "dep": f.dep_airport,
            "arr": f.arr_airport,
            "status": f.status
        }
        for f in results
    ]

@router.get("/flight/{flight_id}")
def get_flight_replay_data(flight_id: str, db: Session = Depends(get_db)):
    """
    Retrieve all historical data (Master, OFP, ACARS Positions) for a specific flight ID
    to render the replay map and timeline.
    """
    # 1. Get Master Flight Data
    master = db.query(MasterFlight).filter(MasterFlight.id == flight_id).first()
    if not master:
        raise HTTPException(status_code=404, detail="Flight not found")
        
    # 2. Get OOOI (Movement) Data
    oooi = db.query(Movement).filter(Movement.flight_id == flight_id).first()
        
    # 3. Get OFP Data
    ofp = db.query(Ofp).filter(Ofp.flight_id == flight_id).first()
    
    # 4. Get all ACARS Position Reports for the flight
    positions = db.query(PositionReport)\
        .filter(PositionReport.flight_id == flight_id)\
        .order_by(PositionReport.created_at.asc())\
        .all()
        
    base_dt = datetime.utcnow()
    if master and master.flight_date_z:
        try:
            base_dt = datetime.strptime(master.flight_date_z, "%Y-%m-%d")
            if master.std_z:
                std_clean = master.std_z.replace("Z", "").replace("z", "").replace(":", "").strip()
                if len(std_clean) >= 4 and std_clean.isdigit():
                    base_dt = base_dt.replace(hour=int(std_clean[:2]), minute=int(std_clean[2:4]))
        except:
            pass

    dep_lat, dep_lon = None, None
    arr_lat, arr_lon = None, None
    
    if ofp and ofp.route_data and len(ofp.route_data) > 0:
        dep_lat = ofp.route_data[0].get("lat")
        dep_lon = ofp.route_data[0].get("long") or ofp.route_data[0].get("lon")
        arr_lat = ofp.route_data[-1].get("lat")
        arr_lon = ofp.route_data[-1].get("long") or ofp.route_data[-1].get("lon")

    # Use hardcoded airport coords if available (most accurate for OOOI)
    if master and master.dep_airport in AIRPORT_COORDS:
        dep_lat = AIRPORT_COORDS[master.dep_airport][0]
        dep_lon = AIRPORT_COORDS[master.dep_airport][1]
    if master and master.arr_airport in AIRPORT_COORDS:
        arr_lat = AIRPORT_COORDS[master.arr_airport][0]
        arr_lon = AIRPORT_COORDS[master.arr_airport][1]

    if not dep_lat and positions:
        dep_lat = positions[0].lat
        dep_lon = positions[0].lon
    if not arr_lat and positions:
        arr_lat = positions[-1].lat
        arr_lon = positions[-1].lon

    merged_positions = []
    for p in positions:
        dt = _parse_event_time(p.report_time, base_dt)
        if not dt and p.created_at: dt = p.created_at
        merged_positions.append({
            "id": p.id,
            "time": p.report_time,
            "lat": p.lat,
            "lon": p.lon,
            "alt": p.alt,
            "fob": p.fob,
            "speed": getattr(p, "mch", None) or 0,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "type": "POS",
            "_sort_time": dt.timestamp() if dt else 0
        })

    def add_oooi(evt_type, evt_time, evt_fob, evt_lat, evt_lon):
        if evt_time:
            dt = _parse_event_time(evt_time, base_dt)
            if not dt: return
            merged_positions.append({
                "id": f"oooi_{evt_type}",
                "time": evt_time,
                "lat": evt_lat,
                "lon": evt_lon,
                "alt": "0",
                "fob": evt_fob,
                "speed": "0",
                "created_at": None,
                "type": evt_type,
                "_sort_time": dt.timestamp()
            })
    
    add_oooi("OUT", master.out_time_z or master.std_z, getattr(oooi, "out_fob", None) if oooi else None, dep_lat, dep_lon)
    add_oooi("OFF", master.off_time_z or master.etd_z, getattr(oooi, "off_fob", None) if oooi else None, dep_lat, dep_lon)
    add_oooi("ON", master.on_time_z or master.eta_z, getattr(oooi, "on_fob", None) if oooi else None, arr_lat, arr_lon)
    add_oooi("IN", master.in_time_z or master.sta_z, getattr(oooi, "in_fob", None) if oooi else None, arr_lat, arr_lon)

    merged_positions.sort(key=lambda x: x["_sort_time"])
    for m in merged_positions:
        m["timestamp"] = int(m["_sort_time"] * 1000)
        del m["_sort_time"]
        
    return {
        "master": {
            "id": master.id,
            "flight_number": master.flight_number,
            "date": master.flight_date_z,
            "dep": master.dep_airport,
            "arr": master.arr_airport,
            "std": master.std_z,
            "sta": master.sta_z,
            "out_time": master.out_time_z,
            "off_time": master.off_time_z,
            "on_time": master.on_time_z,
            "in_time": master.in_time_z,
            "reg": master.aircraft_reg
        },
        "oooi": {
            "out_time": oooi.out_time if oooi else None,
            "off_time": oooi.off_time if oooi else None,
            "on_time": oooi.on_time if oooi else None,
            "in_time": oooi.in_time if oooi else None,
            "out_fob": oooi.out_fob if oooi else None,
            "off_fob": oooi.off_fob if oooi else None,
            "on_fob": oooi.on_fob if oooi else None,
            "in_fob": oooi.in_fob if oooi else None
        } if oooi else None,
        "ofp": {
            "points": ofp.route_data if ofp else [],
            "planned_fuel": ofp.trip_fuel if ofp else None
        } if ofp else None,
        "positions": merged_positions
    }