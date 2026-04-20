import re
from typing import Dict, Any
from datetime import datetime

def parse_mvt_message(body: str, subject: str, email_date_utc: datetime) -> Dict[str, Any] | None:
    lines = [line.strip() for line in body.splitlines() if line.strip()]
    if not lines:
        return None
        
    parsed = {
        "raw_message": body,
        "is_amendment": False,
        "msg_type": None,
        "flight_number": None,
        "flight_date": None,
        "aircraft_reg": None,
        "block_off_time": None,
        "take_off_time": None,
        "touch_down_time": None,
        "block_in_time": None,
        "eta": None,
        "dest": None,
        "dla_code": None,
        "pax_adult": None,
        "pax_infant": None,
        "email_date_utc": email_date_utc
    }
    
    # Check for AMD
    if "[AMD" in body.upper() or "[AMD" in subject.upper():
        parsed["is_amendment"] = True
        
    for line in lines:
        # Flight Info: RF332/17.HL8385.CJJ
        flight_match = re.match(r'^([A-Z0-9]+)/(\d+)\.([A-Z0-9]+)\.([A-Z]{3})', line)
        if flight_match:
            flt_num = flight_match.group(1)
            # Normalize flight number if it starts with RF
            if flt_num.startswith('RF') and flt_num[2:].isdigit():
                flt_num = f"EOK{flt_num[2:]}"
                
            parsed["flight_number"] = flt_num
            parsed["flight_date"] = flight_match.group(2) # day of month
            parsed["aircraft_reg"] = flight_match.group(3)
            # reporting airport is group 4
            continue
            
        # AD: AD2130/2141 EA2234 FUK or AD1230 EA1337 CJJ
        ad_match = re.match(r'^AD(\d{4,6})(?:/(\d{4,6}))?(?:\s+EA(\d{4,6}))?(?:\s+([A-Z]{3}))?', line)
        if ad_match:
            parsed["msg_type"] = "AD"
            parsed["block_off_time"] = ad_match.group(1)
            if ad_match.group(2):
                parsed["take_off_time"] = ad_match.group(2)
            if ad_match.group(3):
                parsed["eta"] = ad_match.group(3)
            if ad_match.group(4):
                parsed["dest"] = ad_match.group(4)
            continue
            
        # ED (Estimated Departure sometimes sent)
        ed_match = re.match(r'^ED(\d{4,6})', line)
        if ed_match:
            parsed["msg_type"] = "ED"
            parsed["block_off_time"] = ed_match.group(1)
            continue
            
        # AA: AA2134/2142 or AA2134
        aa_match = re.match(r'^AA(\d{4,6})(?:/(\d{4,6}))?', line)
        if aa_match:
            parsed["msg_type"] = "AA"
            parsed["touch_down_time"] = aa_match.group(1)
            if aa_match.group(2):
                parsed["block_in_time"] = aa_match.group(2)
            continue
            
        # PAX: PX180/1 or PX140
        px_match = re.match(r'^PX(\d+)(?:/(\d+))?', line)
        if px_match:
            parsed["pax_adult"] = int(px_match.group(1))
            if px_match.group(2):
                parsed["pax_infant"] = int(px_match.group(2))
            else:
                parsed["pax_infant"] = 0
            continue
            
        # DLA: DLAF/0003 or DLAM/AA/0005/0002 or DLFF/AF/0007/0003
        if line.startswith("DLA") or line.startswith("EDLA"):
            # store the whole dla line
            if parsed["dla_code"]:
                parsed["dla_code"] += f", {line}"
            else:
                parsed["dla_code"] = line
            continue

    if not parsed["flight_number"]:
        return None
        
    return parsed
