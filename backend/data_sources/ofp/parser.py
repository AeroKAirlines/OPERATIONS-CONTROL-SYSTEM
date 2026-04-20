import io
import re
import logging
import pdfplumber

logger = logging.getLogger(__name__)

def extract_raw_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extracts raw text from the provided OFP PDF bytes using pdfplumber.
    """
    text_dump = ""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    text_dump += f"--- Page {i + 1} ---\n"
                    text_dump += page_text + "\n\n"
        return text_dump
    except Exception as e:
        logger.error(f"Failed to extract text from PDF: {e}")
        return f"Error parsing PDF: {e}"

def _extract_val(pattern: str, text: str, group: int = 1, default: str | None = None, flags: int = 0) -> str | None:
    match = re.search(pattern, text, flags=flags)
    return match.group(group) if match else default

def _extract_time(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text)
    return match.group(2) if match and (match.lastindex or 0) >= 2 else None

def parse_ofp_text(text: str, target_cfps: list[str]) -> list[dict]:
    """
    Parses the full text dump of an OFP PDF and extracts relevant data 
    for the target CFP numbers.
    """
    parsed_results =[]
    
    # PDF text blocks split by 'FLIGHT RELEASE MSG FOR'
    blocks = re.finditer(
        r"(FLIGHT RELEASE MSG FOR(.*?)(?:THE END OF CFP\s*(\d+)))",
        text,
        re.DOTALL | re.IGNORECASE
    )
    
    for match in blocks:
        block_text = match.group(1)
        header_info = match.group(2)
        end_cfp_nbr = match.group(3)
        
        matched_cfp = None
        for target in target_cfps:
            if target.strip() == end_cfp_nbr.strip():
                matched_cfp = target
                break
                
        if not matched_cfp:
            continue
            
        logger.info(f"Parsing matched OFP Block for CFP NBR: {matched_cfp}")
        
        # Helper for fuel fields (captures fuel amt and optionally time)
        def _get_fuel(name: str):
            m = re.search(fr"{name}[/\w]*\s+0*(\d+)(?:\s+_+_?\s+([\d.]+))?", block_text)
            return (m.group(1) if m else None, m.group(2) if m and (m.lastindex or 0) >= 2 else None)
        
        data = {
            "cfp_number": matched_cfp,
            
            # Flight Info
            "flight_number": _extract_val(r"FLT NR\s+(\S+)", block_text),
            "aircraft_reg": _extract_val(r"REG NR\s+(\S+)", block_text),
            "date": _extract_val(r"DATE\s+(\S+)", block_text),
            "dep_airport": _extract_val(r"FROM\s+(\S+)", block_text),
            "arr_airport": _extract_val(r"TO\s+(\S+)", block_text),
            "payload": _extract_val(r"PLD\s+(\d+)", block_text),
            
            "std": _extract_val(r"STD\s+([0-9]{4}Z?)", block_text) or _extract_val(r"STD\s+(\S+)", block_text),
            "sta": _extract_val(r"STA\s+([0-9]{4}Z?)", block_text) or _extract_val(r"STA\s+(\S+)", block_text),
            
            # 유연한 ETD, ETA 정규식
            "etd": _extract_val(r"ETD[\s:]*([0-9]{4}Z?)", block_text) or _extract_val(r"EST DEP[\s:]*([0-9]{4}Z?)", block_text) or _extract_val(r"ETD/ETA\s+([0-9]{4}Z?)", block_text),
            "eta": _extract_val(r"ETA[\s:]*([0-9]{4}Z?)", block_text) or _extract_val(r"EST ARR[\s:]*([0-9]{4}Z?)", block_text) or _extract_val(r"ETD/ETA\s+[0-9]{4}Z?/([0-9]{4}Z?)", block_text),
            
            "pax_conf": _extract_val(r"PAX CONF\s+(\d+)", block_text) or _extract_val(r"CONF\s+(\d+)\s+TTL", block_text),
            "pax_ttl": _extract_val(r"TTL\s+(\d+)", block_text),
            "cargo_weight": _extract_val(r"CGO\s+0*(\d+)", block_text) or _extract_val(r"CGO\s+(\d+)/KGS", block_text),
            
            # Ops Info Scalars
            "dist_nam": _extract_val(r"DIST/NAM\s+([\d/]+)", block_text),
            "wind_temp": _extract_val(r"WIND/TEMP\s+(\S+)", block_text),
            "apms": _extract_val(r"APMS/([0-9.]+)", block_text),
            "cost_index": _extract_val(r"CI\s+0*(\d+)", block_text),
            "computed_time": _extract_val(r"COMPUTED\s+(\S+)", block_text),
            "pln_fl": _extract_val(r"PLN FL:\s+(.+?)(?=\n|\r|$)", block_text),
            "tkof_altn": _extract_val(r"TKOF ALTN:\s+(\S+)", block_text),
            
            "route_str": _extract_val(r"[A-Z]{3}/[A-Z]{3}:\s*(.*?)\n(?:DEP ATC CLR)", block_text, flags=re.DOTALL),
            
            "dispatcher": _extract_val(r"DISPATCHER:\s+([^\n]+)", block_text),
            "pic": _extract_val(r"PILOT IN COMMAND\s*:\s+([^\n]+?)\s+SIGN", block_text),
            
            # Weight Info
            "ezfw": _extract_val(r"EZFW\s+(\d+)", block_text),
            "mzfw": _extract_val(r"MZFW\s+(\d+)", block_text),
            "etow": _extract_val(r"ETOW\s+(\d+)", block_text),
            "mtow": _extract_val(r"MTOW\s+(\d+)", block_text),
            "eldw": _extract_val(r"ELDW\s+(\d+)", block_text),
            "mldw": _extract_val(r"MLDW\s+(\d+)", block_text),
            "dow": _extract_val(r"DOW\s+(\d+)", block_text),
            "agtow": _extract_val(r"AGTOW\s+(\d+)", block_text),
            "tcap": _extract_val(r"TCAP\s+(\d+)", block_text),
            
            # Blocks & JSONs
            "mel_cdl": _extract_val(r"MEL/CDL INFO\n(.*?)SPECIAL INFO", block_text, flags=re.DOTALL),
            "special_info_raw": _extract_val(r"SPECIAL INFO\n(.*?)(?:-{30,}|ICAO FLIGHT PLAN)", block_text, flags=re.DOTALL),
            "ops_impacts_raw": _extract_val(r"OPERATIONS IMPACTS-+\n(.*?)(?:-{30,}|OPTIONAL ALTERNATES)", block_text, flags=re.DOTALL),
            "alternates_raw": _extract_val(r"OPTIONAL ALTERNATES-+\n(.*?)(?:PAGE \d+ OF \d+|-{30,})", block_text, flags=re.DOTALL),
            "icao_fpl": _extract_val(r"ICAO FLIGHT PLAN\n\((FPL-.*?)\)\n-{30,}", block_text, flags=re.DOTALL),
            
            "special_info": {},
            "ops_impacts": {},
            "alternates": [],
            "route_data":[],
            "tankering_data": {}
        }
        
        # Clean up some strings
        for k in["route_str", "mel_cdl", "special_info_raw", "ops_impacts_raw", "alternates_raw", "icao_fpl", "dispatcher", "pic"]:
            if data.get(k): data[k] = data[k].strip()
        
        def _get_fuel_ext(name: str):
            if name.startswith("DISC"):
                # Handle DISC (Extra) fuel separately to capture the reason code
                m = re.search(r"DISC/?([A-Z]*)\s+0*(\d+)(?:\s+_{2,}\s+([\d.]+))?", block_text)
                if m:
                    reason = m.group(1) if m.group(1) else None
                    amt = m.group(2)
                    time = m.group(3) if m.lastindex >= 3 else None
                    if not time:
                        m2 = re.search(r"DISC/?([A-Z]*)\s+0*(\d+)\s+_{2,}\s+([\d.]+)", block_text)
                        if m2:
                            reason = m2.group(1) if m2.group(1) else None
                            amt = m2.group(2)
                            time = m2.group(3)
                    return (amt, time, reason)
                return (None, None, None)
            
            m = re.search(fr"{name}[/\w]*\s+0*(\d+)(?:\s+_{{2,}}\s+([\d.]+))?", block_text)
            amt = m.group(1) if m else None
            time = m.group(2) if m and m.lastindex and m.lastindex >= 2 else None
            
            if not time:
                m2 = re.search(fr"{name}[/\w]*\s+0*(\d+)\s+_{{2,}}\s+([\d.]+)", block_text)
                if m2:
                    amt = m2.group(1)
                    time = m2.group(2)
                    
            return (amt, time)
            
        fuels =[
            ("TRIP", "trip_fuel", "trip_time"),
            ("CONT 5%", "cont_fuel", "cont_time"),
            ("ALTN", "altn_fuel", "altn_time"),
            ("FRSV", "frsv_fuel", "frsv_time"),
            ("ADDI", "addi_fuel", "addi_time"),
            ("TAXI", "taxi_fuel", None),
            ("REQF", "reqf_fuel", "reqf_time"),
            ("DISC", "extra_fuel", "extra_time"),
            ("CCF", "ccf_fuel", "ccf_time"),
            ("TANK", "tank_fuel", "tank_time"),
            ("RAMP", "ramp_fuel", "ramp_time"),
            ("MIN RSV", "min_rsv", "min_rsv_time"),
            ("EFOB", "efob", "efob_time")
        ]
        for fuel_tup in fuels:
            name = fuel_tup[0]
            f_amt = fuel_tup[1]
            f_time = fuel_tup[2] if len(fuel_tup) > 2 else None
            
            if name == "DISC":
                amt, time, reason = _get_fuel_ext(name)
                data[f_amt] = amt
                data["extra_reason"] = reason
                if f_time:
                    data[f_time] = time
            else:
                amt, time = _get_fuel_ext(name)
                data[f_amt] = amt
                if f_time:
                    data[f_time] = time
        
        spec_raw = data.get("special_info_raw", "")
        if spec_raw:
            rtow_matches = re.finditer(r"(?:\[RTOW\])?\s*([\d.]+)\s*\[(.*?)\]", spec_raw)
            rtows =[]
            for m in rtow_matches:
                details_str = m.group(2)
                details = [d.strip() for d in details_str.split(',')]
                rtow_dict = {"weight": m.group(1), "raw_details": details_str}
                if len(details) >= 5:
                    rtow_dict["rwy"] = details[0]
                    rtow_dict["condition"] = details[1]
                    rtow_dict["wind"] = details[2]
                    rtow_dict["temp"] = details[3]
                    rtow_dict["qnh"] = details[4]
                    rtow_dict["others"] = details[5:]
                rtows.append(rtow_dict)
            
            stand_match = re.search(r"DEP\s*([A-Z0-9]+)\s*/\s*ARR\s*([A-Z0-9]+)", spec_raw)
            stand_dict = {}
            if stand_match:
                stand_dict["dep"] = stand_match.group(1)
                stand_dict["arr"] = stand_match.group(2)
                
            data["special_info"] = {
                "raw": spec_raw,
                "rtows": rtows,
                "stands": stand_dict
            }
            
        ops_raw = data.get("ops_impacts_raw", "")
        if ops_raw:
            trip_adj_m = re.search(r"TRIP ADJ\s+(\d+)", ops_raw)
            trip_adj = trip_adj_m.group(1) if trip_adj_m else None
            
            fl_matches = re.finditer(r"FL(\d+)\s+TIF/(\d+)\s+TIME/([\d.]+)\s+WIND/([A-Z0-9]+)", ops_raw)
            levels =[]
            for m in fl_matches:
                levels.append({
                    "fl": m.group(1),
                    "tif": m.group(2),
                    "time": m.group(3),
                    "wind": m.group(4)
                })
                
            data["ops_impacts"] = {
                "raw": ops_raw,
                "trip_adj": trip_adj,
                "levels": levels
            }
            
        alt_raw = data.get("alternates_raw", "")
        if alt_raw:
            alt_matches = re.finditer(r"(\d+)/([A-Z0-9]+)\s+([\d/]+)\s+(\d+)\s+([MP]\d+)\s+(\d+)\s+([\d:]+)\s+(.+)", alt_raw)
            for m in alt_matches:
                data["alternates"].append({
                    "id": m.group(1),
                    "name": m.group(2),
                    "dist_nam": m.group(3),
                    "fl": m.group(4),
                    "wind_comp": m.group(5),
                    "fuel": m.group(6),
                    "time": m.group(7),
                    "rte": m.group(8).strip()
                })
        
        # Route Data 파싱 로직 개선
        wpt_block_pattern = re.compile(
            r"^([A-Z0-9*]{2,7})\s+([NS]\s*\d{2,3}\s*[\d.]+)\s*(.*?)\n"
            r"^([A-Z0-9]+)\s+([EW]\s*\d{3,4}\s*[\d.]+)\s+(\d+)\s+(\d+)\s+([A-Z0-9P]+)\s+(\d{2}:\d{2}).*?\n"
            r"^(?:(?:[\d.]+|-----)\s+)?(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d{2}:\d{2})[\s_]+(\d+)",
            re.MULTILINE
        )
        
        seen_coords = set()
        for match in wpt_block_pattern.finditer(block_text):
            wpt = match.group(1)
            lat = match.group(2).replace(" ", "")
            l1_rest = match.group(3).strip()
            
            fl, temp, wind_comp, pacmf = "", "", "", ""
            if l1_rest:
                # ex: "CLB  CLB    170/18P014      0508" or "360  M50    262/109M070     1854"
                parts = l1_rest.split()
                if len(parts) >= 4:
                    fl = parts[0]
                    temp = parts[1]
                    wind_comp = parts[2]
                    pacmf = parts[3]
            
            rte = match.group(4)
            lon = match.group(5).replace(" ", "")
            dist = match.group(6)
            tas = match.group(7)
            dv = match.group(8)
            leg_t = match.group(9)
            
            mora = match.group(10)
            mc = match.group(11)
            gs = match.group(12)
            ws = match.group(13)
            tot_t = match.group(14)
            efob = match.group(15)
            
            coord_key = f"{lat}_{lon}_{wpt}"
            if coord_key not in seen_coords:
                seen_coords.add(coord_key)
                data["route_data"].append({
                    "wpt": wpt,
                    "lat": lat,
                    "fl": fl,
                    "temp": temp,
                    "wind_comp": wind_comp,
                    "pacmf": pacmf,
                    "rte": rte,
                    "long": lon,
                    "dist": dist,
                    "tas": tas,
                    "dv": dv,
                    "leg_t": leg_t,
                    "mora": mora,
                    "mc": mc,
                    "gs": gs,
                    "ws": ws,
                    "tot_t": tot_t,
                    "efob": efob
                })
            
        # Tankering Info
        tank_profit = _extract_val(r"PROFIT\s+(\d+)\s+USD", block_text)
        if tank_profit:
            data["tankering_data"] = {
                "fuel_unit_price_orig": _extract_val(r"ORIG\s+([0-9.]+)\s+USD", block_text),
                "fuel_unit_price_dest": _extract_val(r"DEST\s+([0-9.]+)\s+USD", block_text),
                "tank_surplus_burn": _extract_val(r"FUEL TO CARRY\s+(\d+)", block_text),
                "tank_profit": tank_profit
            }
            
        parsed_results.append(data)
        
    return parsed_results