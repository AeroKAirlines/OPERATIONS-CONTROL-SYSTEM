import re
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

def parse_coordinate(coord: str, is_lat: bool) -> Optional[str]:
    if not coord:
        return None
    coord = coord.replace(" ", "").upper()
    if not coord:
        return None
    
    direction = coord[0]
    if direction not in ['N', 'S', 'E', 'W']:
        return coord
        
    val_str = coord[1:]
    try:
        if '.' in val_str:
            val = float(val_str)
            deg_len = 2 if is_lat else 3
            if (is_lat and val > 90) or (not is_lat and val > 180):
                str_parts = val_str.split('.')
                if len(str_parts[0]) > deg_len:
                    deg = float(val_str[:deg_len])
                    mins = float(val_str[deg_len:])
                    val = deg + mins / 60.0
        else:
            if is_lat:
                if len(val_str) == 5:
                    deg = float(val_str[:2])
                    mins = float(val_str[2:]) / 10.0
                    val = deg + mins / 60.0
                elif len(val_str) == 4:
                    deg = float(val_str[:2])
                    mins = float(val_str[2:])
                    val = deg + mins / 60.0
                else:
                    val = float(val_str)
            else:
                if len(val_str) == 6:
                    deg = float(val_str[:3])
                    mins = float(val_str[3:]) / 10.0
                    val = deg + mins / 60.0
                elif len(val_str) == 5:
                    deg = float(val_str[:3])
                    mins = float(val_str[3:])
                    val = deg + mins / 60.0
                else:
                    val = float(val_str)
                    
        if direction in ['S', 'W']:
            val = -val
            
        return str(round(val, 6))
    except Exception:
        return coord

def parse_acars_message(body: str) -> Optional[Dict[str, Any]]:
    # 1. Clean up body
    lines = body.splitlines()
    full_text = " ".join([line.strip() for line in lines if line.strip()])
    
    # [FIX] 헤더에서 진짜 보고 시간(DT)을 추출 (예: DT JDL HND2 160437 -> 16일 04시37분)
    real_report_time = None
    dt_match = re.search(r'DT\s+[A-Z]{3}\s+[A-Z0-9]+\s+(\d{2})(\d{4})', full_text)
    if dt_match:
        day_str = dt_match.group(1)
        time_str = dt_match.group(2)
        real_report_time = f"{time_str}/{day_str}" # router.py 호환 (HHMM/DD)

    # 2. Identify Message Type and Header (ETA 타입 추가 및 편명 분리 추출)
    # 매치 예 1: POSRPT 0321/16 RJAA/RKTU .HL8743
    msg_type_match = re.search(r'(OUTRP|OFFRP|ONRP|INRP|POSRPT|ETA)\s+(\d{3,4})/(?:\s*\d{2})?\s*([A-Z0-9\-]{4}/[A-Z0-9\-]{4})\s+\.(HL\d{4})', full_text)
    
    # 매치 예 2: A80 FI RF0/AN HL8596 DT BKK CJJ 181958 M00A - 1001 OUTRP 0614/18 / /OUT 1958...
    alt_msg_match = None
    if not msg_type_match:
        alt_msg_match = re.search(r'AN\s+(HL\d{4})\s+DT\s+([A-Z]{3,4})\s+([A-Z]{3,4})\s+\d{6}.*?(OUTRP|OFFRP|ONRP|INRP|POSRPT|ETA)\s+(\d{3,4})', full_text)

    if not msg_type_match and not alt_msg_match:
        # 3. Try ARINC 622 POS reports
        # 정규식을 수정하여 문장 끝부분의 숫자와 문자(extra_data)까지 모두 캡처합니다.
        arinc_pos_match = re.search(r'FI\s+(?:RF)?([A-Z0-9]+)/AN\s+(HL\d{4}).*?-\s*POS(?:HL\d{4})?(\d{4})([A-Z]{4})([A-Z]{4})\d{2}[A-Z]{3}\d{2}(\d{4})\d{2}\s*T?([NS]\s*\d+\.\d{3})([EW]\d+\.\d{3})\d{6}\s+(\d+)[-\s]+(.*)', full_text)
        
        if arinc_pos_match:
            header_fn = arinc_pos_match.group(1).strip()
            reg = arinc_pos_match.group(2)
            embedded_fn = arinc_pos_match.group(3)
            
            raw_fn = embedded_fn if header_fn == "0000" else header_fn
            flight_number = f"EOK{int(raw_fn)}" if raw_fn.isdigit() else raw_fn
            
            route = f"{arinc_pos_match.group(4)}/{arinc_pos_match.group(5)}"
            
            if not real_report_time:
                day_match = re.search(r'POS(?:HL\d{4})?\d{4}[A-Z]{8}(\d{2})[A-Z]{3}', full_text)
                day_str = day_match.group(1) if day_match else "01"
                real_report_time = f"{arinc_pos_match.group(6)}/{day_str}"
            
            lat = parse_coordinate(arinc_pos_match.group(7), True)
            lon = parse_coordinate(arinc_pos_match.group(8), False)
            
            alt_raw = arinc_pos_match.group(9)
            if len(alt_raw) > 5:
                alt = alt_raw[:4] if int(alt_raw[:5]) > 45000 else alt_raw[:5]
            else:
                alt = alt_raw
            
            #[FIX] 고도 뒤에 붙어있는 숫자 그룹 추출
            extra_data = arinc_pos_match.group(10).strip()
            fob = None
            if extra_data:
                parts = extra_data.split()
                if parts:
                    fob_raw = parts[-1]  # 마지막 숫자 그룹은 무조건 FOB
                    try:
                        # 다른 일반 메세지와 단위를 맞추기 위해 100을 곱해줍니다 (예: 51 -> 5100)
                        fob = str(int(fob_raw) * 100)
                    except ValueError:
                        fob = fob_raw
            
            return {
                "msg_type": "POSRPT",
                "report_time": real_report_time,
                "route": route,
                "aircraft_reg": reg,
                "flight_number": flight_number,
                "raw_message": full_text,
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "fob": fob,    # 이제 FOB가 완벽하게 들어갑니다!
                "mch": None,   # 압축 형식에는 MCH 정보가 없음
                "eta": None    # 압축 형식에는 ETA 정보가 없음
            }
        else:
            # 매칭되는 포맷을 찾지 못하면 로깅하고 None 반환
            logger.error(f"Failed to parse ACARS message format. Raw text: {full_text}")
            return None
        
    if msg_type_match:
        msg_type = msg_type_match.group(1)
        flight_num_extracted = msg_type_match.group(2) # 예: 0321
        route = msg_type_match.group(3)
        reg = msg_type_match.group(4)
    elif alt_msg_match:
        reg = alt_msg_match.group(1)
        route = f"{alt_msg_match.group(2)}/{alt_msg_match.group(3)}"
        msg_type = alt_msg_match.group(4)
        flight_num_extracted = alt_msg_match.group(5)
    else:
        return None
    
    # 편명 구성 (EOK 붙이기)
    flight_number = f"EOK{int(flight_num_extracted)}"
            
    # 4. Tokenize by Slash '/'
    tokens = full_text.split('/')
    
    parsed_data = {
        "msg_type": msg_type,
        "report_time": real_report_time,
        "route": route,
        "aircraft_reg": reg,
        "flight_number": flight_number,
        "raw_message": full_text
    }
    
    for token in tokens:
        token = token.strip()
        if token.startswith("OUT"): parsed_data["out_time"] = token.replace("OUT", "").strip()
        elif token.startswith("OFF"): parsed_data["off_time"] = token.replace("OFF", "").strip()
        elif token.startswith("ON"): parsed_data["on_time"] = token.replace("ON", "").strip()
        elif token.startswith("IN"): parsed_data["in_time"] = token.replace("IN", "").strip()
        elif token.startswith("FOB"):
            fob_raw_str = token.replace("FOB", "").strip()
            if fob_raw_str:  # 값이 비어있지 않은 경우에만 처리
                fob_raw = fob_raw_str.split()[0]
                try:
                    parsed_data["fob"] = str(int(fob_raw) * 100)
                except ValueError:
                    parsed_data["fob"] = fob_raw
        elif token.startswith("ETA"):
            eta_raw_str = token.replace("ETA", "").strip()
            if eta_raw_str:  # 값이 비어있지 않은 경우에만 처리
                parsed_data["eta"] = eta_raw_str.split()[0]
        elif token.startswith("DOR"): parsed_data["dor"] = token.replace("DOR", "").strip()
        elif token.startswith("POS"):
            pos_str = token.replace("POS", "").strip()
            # E 나 W 위치를 찾아 안전하게 위경도 분리
            ew_idx = pos_str.find('E')
            if ew_idx == -1: ew_idx = pos_str.find('W')
            if ew_idx != -1:
                parsed_data["lat"] = parse_coordinate(pos_str[:ew_idx], True)
                parsed_data["lon"] = parse_coordinate(pos_str[ew_idx:], False)
            else:
                parsed_data["lat"] = pos_str
        elif token.startswith("ALT"): parsed_data["alt"] = token.replace("ALT", "").strip()
        elif token.startswith("MCH"): parsed_data["mch"] = token.replace("MCH", "").strip()
            
    return parsed_data