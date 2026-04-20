import os
import sys

# Add project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.core.database import SessionLocal
from backend.data_sources.acars.models import Movement
from backend.data_sources.acars.parser import parse_acars_message

def reparse_fob_for_all_movements():
    db = SessionLocal()
    try:
        movements = db.query(Movement).all()
        print(f"Found {len(movements)} Movement records. Re-evaluating FOB data...")
        
        updated_count = 0
        for mov in movements:
            raw_msgs = mov.raw_messages
            if not raw_msgs or not isinstance(raw_msgs, dict):
                continue
                
            changed = False
            for msg_type, raw_text in raw_msgs.items():
                parsed_data = parse_acars_message(raw_text)
                if not parsed_data:
                    continue
                    
                fob_val = parsed_data.get("fob")
                if not fob_val:
                    continue
                
                fob_str = str(fob_val)
                
                if msg_type == "OUTRP" and mov.out_fob != fob_str:
                    mov.out_fob = fob_str
                    changed = True
                elif msg_type == "OFFRP" and mov.off_fob != fob_str:
                    mov.off_fob = fob_str
                    changed = True
                elif msg_type == "ONRP" and mov.on_fob != fob_str:
                    mov.on_fob = fob_str
                    changed = True
                elif msg_type == "INRP" and mov.in_fob != fob_str:
                    mov.in_fob = fob_str
                    changed = True
            
            if changed:
                updated_count += 1
                
        db.commit()
        print(f"Successfully updated FOB data for {updated_count} Movement records.")
        
    except Exception as e:
        print(f"Error during execution: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    reparse_fob_for_all_movements()