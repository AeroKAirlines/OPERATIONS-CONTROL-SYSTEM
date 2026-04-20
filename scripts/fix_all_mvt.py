import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.database import SessionLocal
from backend.data_sources.common.models import MasterFlight
from backend.data_sources.acars.models import Movement
from backend.data_sources.mvt.models import LiveMVT

def process_all_flights():
    db = SessionLocal()
    try:
        flights = db.query(MasterFlight).all()
        updated_count = 0
        
        for flight in flights:
            acars_mov = db.query(Movement).filter(Movement.flight_id == flight.id).first()
            mvt_ad = db.query(LiveMVT).filter(LiveMVT.flight_id == flight.id, LiveMVT.msg_type == "AD").order_by(LiveMVT.created_at.desc()).first()
            mvt_aa = db.query(LiveMVT).filter(LiveMVT.flight_id == flight.id, LiveMVT.msg_type == "AA").order_by(LiveMVT.created_at.desc()).first()
            
            def safe_get_acars(field):
                return getattr(acars_mov, field, None) if acars_mov else None
                
            def extract_hhmm(dt_str):
                return dt_str.split(" ")[-1] if dt_str else None
                
            old_out = flight.out_time_z
            old_off = flight.off_time_z
            old_on = flight.on_time_z
            old_in = flight.in_time_z
            
            if mvt_ad and mvt_ad.block_off_time:
                flight.out_time_z = extract_hhmm(mvt_ad.block_off_time)
            elif safe_get_acars("out_time"):
                flight.out_time_z = safe_get_acars("out_time")
                
            if mvt_ad and mvt_ad.take_off_time:
                flight.off_time_z = extract_hhmm(mvt_ad.take_off_time)
            elif safe_get_acars("off_time"):
                flight.off_time_z = safe_get_acars("off_time")
                
            if mvt_aa and mvt_aa.touch_down_time:
                flight.on_time_z = extract_hhmm(mvt_aa.touch_down_time)
            elif safe_get_acars("on_time"):
                flight.on_time_z = safe_get_acars("on_time")
                
            if mvt_aa and mvt_aa.block_in_time:
                flight.in_time_z = extract_hhmm(mvt_aa.block_in_time)
            elif safe_get_acars("in_time"):
                flight.in_time_z = safe_get_acars("in_time")
                
            if old_out != flight.out_time_z or old_off != flight.off_time_z or old_on != flight.on_time_z or old_in != flight.in_time_z:
                updated_count += 1
                print(f"[{flight.flight_number}] Updated: OUT ({old_out}->{flight.out_time_z}), OFF ({old_off}->{flight.off_time_z}), ON ({old_on}->{flight.on_time_z}), IN ({old_in}->{flight.in_time_z})")
            
        db.commit()
        print(f"\nSuccessfully re-evaluated all flights. Total flights updated: {updated_count}")
        
    finally:
        db.close()

if __name__ == "__main__":
    process_all_flights()