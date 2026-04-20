import os
import sys

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.database import SessionLocal
from backend.data_sources.common.models import MasterFlight
from backend.data_sources.acars.models import Movement
from backend.data_sources.mvt.models import LiveMVT

def reevaluate_oooi_for_flight(flight_number_like):
    db = SessionLocal()
    try:
        flights = db.query(MasterFlight).filter(MasterFlight.flight_number.like(f"%{flight_number_like}%")).all()
        if not flights:
            print(f"No flights found containing '{flight_number_like}'")
            return
            
        print(f"Found {len(flights)} flights matching '{flight_number_like}'. Reevaluating OOOI...")
        for flight in flights:
            print(f"\n--- Flight ID: {flight.id} ---")
            print(f"Current Master OOOI: OUT={flight.out_time_z}, OFF={flight.off_time_z}, ON={flight.on_time_z}, IN={flight.in_time_z}")
            
            # Get ACARS (Movement)
            acars_mov = db.query(Movement).filter(Movement.flight_id == flight.id).first()
            if acars_mov:
                print(f"ACARS Record: OUT={acars_mov.out_time}, OFF={acars_mov.off_time}, ON={acars_mov.on_time}, IN={acars_mov.in_time}")
            else:
                print("No ACARS Record found.")
                
            # Get MVT (LiveMVT)
            latest_mvt = db.query(LiveMVT).filter(LiveMVT.flight_id == flight.id).order_by(LiveMVT.created_at.desc()).first()
            if latest_mvt:
                print(f"MVT Record: OUT={latest_mvt.block_off_time}, OFF={latest_mvt.take_off_time}, ON={latest_mvt.touch_down_time}, IN={latest_mvt.block_in_time}")
            else:
                print("No MVT Record found.")
                
            # Apply new logic
            def safe_get_acars(field):
                return getattr(acars_mov, field, None) if acars_mov else None
                
            def extract_hhmm(dt_str):
                return dt_str.split(" ")[-1] if dt_str else None
                
            old_off = flight.off_time_z
            
            if latest_mvt and latest_mvt.block_off_time:
                flight.out_time_z = extract_hhmm(latest_mvt.block_off_time)
            elif safe_get_acars("out_time"):
                flight.out_time_z = safe_get_acars("out_time")
                
            if latest_mvt and latest_mvt.take_off_time:
                flight.off_time_z = extract_hhmm(latest_mvt.take_off_time)
            elif safe_get_acars("off_time"):
                flight.off_time_z = safe_get_acars("off_time")
                
            if latest_mvt and latest_mvt.touch_down_time:
                flight.on_time_z = extract_hhmm(latest_mvt.touch_down_time)
            elif safe_get_acars("on_time"):
                flight.on_time_z = safe_get_acars("on_time")
                
            if latest_mvt and latest_mvt.block_in_time:
                flight.in_time_z = extract_hhmm(latest_mvt.block_in_time)
            elif safe_get_acars("in_time"):
                flight.in_time_z = safe_get_acars("in_time")
                
            print(f"Updated Master OOOI: OUT={flight.out_time_z}, OFF={flight.off_time_z}, ON={flight.on_time_z}, IN={flight.in_time_z}")
            
            if old_off != flight.off_time_z:
                print(f"--> [FIXED] OFF time updated from ACARS ({old_off}) to MVT ({flight.off_time_z})!")
            
        db.commit()
        print("\nAll changes committed to database successfully.")
        
    finally:
        db.close()

if __name__ == "__main__":
    reevaluate_oooi_for_flight("393")
