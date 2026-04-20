import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.database import SessionLocal
from backend.data_sources.common.models import MasterFlight
from backend.data_sources.mvt.models import LiveMVT

def check_mvt():
    db = SessionLocal()
    mvt_records = db.query(LiveMVT).filter(LiveMVT.flight_number.like("%393%")).all()
    print(f"Found {len(mvt_records)} MVT records for 393:")
    for r in mvt_records:
        print(f"Flight: {r.flight_date} {r.flight_number}, Type: {r.msg_type}")
        print(f"  OUT: {r.block_off_time}, OFF: {r.take_off_time}")
        print(f"  ON: {r.touch_down_time}, IN: {r.block_in_time}")
        print(f"  RAW: {r.raw_message}")
        print("-" * 40)
        
if __name__ == "__main__":
    check_mvt()