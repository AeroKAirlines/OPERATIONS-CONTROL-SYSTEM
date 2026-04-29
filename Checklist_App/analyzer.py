import re
import uuid
import math
from datetime import datetime, timedelta
from collections import defaultdict
from Checklist_App.config import FLIGHT_DB, DEFAULT_FLIGHT, DOW_DB, TANKERING_DB, PANTRY_CIB_DEST, TAXI_FUEL_DB, RWY_DB, TARGET_CPTS

def get_dow_code(dep, arr):
    if dep == 'CJU' or arr == 'CJU': return 'D'
    if dep == 'ICN' or arr == 'ICN': return 'IIa'
    if arr in PANTRY_CIB_DEST or dep in PANTRY_CIB_DEST: return 'CIb'
    return 'CIa'

def parse_aar_text(aar_text):
    pattern = r"(\d{2}\.\d{2})\s+([A-Z0-9]+)\s+([A-Z]{3})\s+([A-Z]{3})\s+(\d{4})\s+(\d{4})\s+(HL\d{4})\s+\d+\s+\d+\s+(.*)"
    matches = re.findall(pattern, aar_text)
    current_year = datetime.now().year
    current_month = datetime.now().month
    
    raw_list = []
    for match in matches:
        date_str, flt_num, dep, arr, etd_z, eta_z, reg, cpt_name = match
        day_str, month_str = date_str.split('.')
        month = int(month_str)
        
        calc_year = current_year
        if current_month == 12 and month == 1: calc_year += 1
        elif current_month == 1 and month == 12: calc_year -= 1
        
        num_only = re.sub(r'[^0-9]', '', flt_num)
        raw_list.append({
            "is_from_aar": True, "date_str": date_str, "calc_year": calc_year, 
            "flt_num": flt_num, "num_only": num_only, "dep": dep, "arr": arr, 
            "etd_z": etd_z, "eta_z": eta_z, "reg": reg, "cpt": cpt_name.strip()
        })
        
    parsed_flights = []
    skip_next = False
    
    for i in range(len(raw_list)):
        if skip_next:
            skip_next = False
            continue
            
        curr = raw_list[i]
        nxt = raw_list[i+1] if i+1 < len(raw_list) else None
        
        db_info = FLIGHT_DB.get(curr["num_only"], DEFAULT_FLIGHT)
        pair_num = db_info["pair"]
        pair_id = f"PAIR_{uuid.uuid4().hex[:8]}" 
        
        def create_missing(ref_data, target_num_only, is_outbound):
            ref_dt = datetime.strptime(f"{ref_data['calc_year']}-{ref_data['date_str'].split('.')[1]}-{ref_data['date_str'].split('.')[0]} {ref_data['etd_z'][:2]}:{ref_data['etd_z'][2:]}", "%Y-%m-%d %H:%M")
            t_db = FLIGHT_DB.get(target_num_only)
            if not t_db: return None
            
            t_dt = datetime.combine(ref_dt.date(), datetime.strptime(f"{t_db['std_z'][:2]}:{t_db['std_z'][2:]}", "%H:%M").time())
            if is_outbound:
                if t_dt > ref_dt: t_dt -= timedelta(days=1)
            else:
                if t_dt < ref_dt: t_dt += timedelta(days=1)
                
            return {
                "is_from_aar": False, "date_str": t_dt.strftime("%d.%m"), "calc_year": ref_data['calc_year'], 
                "flt_num": f"RF{target_num_only}", "num_only": target_num_only,
                "dep": t_db["route"].split(" - ")[0], "arr": t_db["route"].split(" - ")[1],
                "etd_z": t_db["std_z"], "eta_z": t_db["sta_z"], "reg": ref_data["reg"], "cpt": ref_data["cpt"],
                "pair_id": pair_id
            }

        outbound_data, return_data = None, None
        if nxt and nxt["num_only"] == pair_num:
            if db_info["type"] == "out" or db_info["type"] == "": outbound_data, return_data = curr, nxt
            else: return_data, outbound_data = curr, nxt
            outbound_data["pair_id"] = pair_id
            return_data["pair_id"] = pair_id
            skip_next = True
        else:
            if db_info["type"] == "out" or db_info["type"] == "":
                outbound_data = curr
                outbound_data["pair_id"] = pair_id
                return_data = create_missing(curr, pair_num, False)
            else:
                return_data = curr
                return_data["pair_id"] = pair_id
                outbound_data = create_missing(curr, pair_num, True)

        if outbound_data: parsed_flights.append(outbound_data)
        if return_data: parsed_flights.append(return_data)

    def get_dt(f):
        dt_str = f"{f['calc_year']}-{f['date_str'].split('.')[1]}-{f['date_str'].split('.')[0]} {f['etd_z'][:2]}:{f['etd_z'][2:]}"
        return datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        
    parsed_flights.sort(key=get_dt)
    return parsed_flights

def calculate_checklist(raw_list, mel_text="", weather_data=None):
    if weather_data is None:
        weather_data = {}

    # 브라우저에서 넘겨받은 날씨 데이터를 파이썬이 읽기 좋게 다듬습니다.
    parsed_weather = {}
    for apt, w_data in weather_data.items():
        if not w_data or w_data.get("error"): continue
        
        hourly = w_data.get('hourly', {})
        times = hourly.get('time', [])
        temps = hourly.get('temperature_2m', [])
        pressures = hourly.get('pressure_msl', [])
        wind_dirs = hourly.get('winddirection_10m', [])
        wind_spds = hourly.get('windspeed_10m', [])
        precips = hourly.get('precipitation', [])

        data_dict = {}
        for i, t_str in enumerate(times):
            if i >= len(temps) or i >= len(pressures) or i >= len(wind_dirs): continue
            if temps[i] is None or pressures[i] is None or wind_dirs[i] is None: continue
            
            w_spd = wind_spds[i] if i < len(wind_spds) and wind_spds[i] is not None else 0
            data_dict[t_str] = {
                "temp": temps[i], "qnh": pressures[i], "wind_dir": wind_dirs[i], "wind_spd": w_spd,
                "precip": precips[i] if i < len(precips) and precips[i] is not None else 0
            }
        parsed_weather[apt] = data_dict

    def get_forecast_for_time(airport, dt_z):
        data = parsed_weather.get(airport, {})
        rounded_dt = dt_z if dt_z.minute < 30 else dt_z + timedelta(hours=1)
        
        times_to_check = [
            rounded_dt - timedelta(hours=1),
            rounded_dt,
            rounded_dt + timedelta(hours=1)
        ]
        
        max_precip = 0
        min_temp_during_precip = 99
        
        for t in times_to_check:
            tk = t.strftime("%Y-%m-%dT%H:00")
            fcst = data.get(tk)
            if fcst:
                if fcst["precip"] > 0:
                    max_precip = max(max_precip, fcst["precip"])
                    min_temp_during_precip = min(min_temp_during_precip, fcst["temp"])
                    
        if max_precip > 0:
            if min_temp_during_precip <= 2.0: rwy_cond = "C"
            else: rwy_cond = "W"
        else: rwy_cond = "D"

        time_key = rounded_dt.strftime("%Y-%m-%dT%H:00")
        forecast = data.get(time_key)
        
        if not forecast:
            return "", "", "", "", "", ""

        wind_dir = forecast["wind_dir"]
        wind_spd = forecast.get("wind_spd", 0)
        rwys = RWY_DB.get(airport, ["", ""])
        predicted_rwy = rwys[0]
        
        if rwys[0] and rwys[1]:
            try:
                hdg1 = int(re.sub(r'\D', '', rwys[0])) * 10
                hdg2 = int(re.sub(r'\D', '', rwys[1])) * 10
                diff1 = abs((wind_dir - hdg1 + 180) % 360 - 180)
                diff2 = abs((wind_dir - hdg2 + 180) % 360 - 180)
                predicted_rwy = rwys[0] if diff1 <= diff2 else rwys[1]
            except:
                predicted_rwy = rwys[0]
                
        conservative_temp = math.ceil(forecast["temp"] / 5.0) * 5
        conservative_qnh = math.floor(forecast["qnh"] / 5.0) * 5
        
        return conservative_temp, conservative_qnh, predicted_rwy, rwy_cond, wind_dir, wind_spd

    mel_db = defaultdict(list)
    mel_footnotes_db = defaultdict(list)
    if mel_text:
        for line in mel_text.split('\n'):
            reg_match = re.search(r'(HL\d{4})', line)
            if reg_match:
                reg = reg_match.group(1)
                code_match = re.search(r'(MEL|CDL)\s+([A-Z0-9-]+)', line)
                if code_match:
                    item = f"{code_match.group(1)} {code_match.group(2).strip('-')}"
                    
                    parts = [p.strip() for p in line.split('\t') if p.strip()]
                    remark = ""
                    code_idx = -1
                    for i, p in enumerate(parts):
                        if (p.startswith('MEL') or p.startswith('CDL')) and code_match.group(2).strip('-') in p:
                            code_idx = i
                            break
                    
                    if code_idx != -1 and len(parts) > code_idx + 2:
                        possible_remark = parts[code_idx+2]
                        if possible_remark != '-' and not re.match(r'^\d{4}-\d{2}-\d{2}$', possible_remark):
                            remark = possible_remark
                            
                    if remark:
                        display_str = f'<span style="color:red; font-weight:bold;">{item} *</span>'
                        if display_str not in mel_db[reg]:
                            mel_db[reg].append(display_str)
                            mel_footnotes_db[reg].append(f"* {reg} ({item}): {remark}")
                    else:
                        if item not in mel_db[reg]:
                            mel_db[reg].append(item) 

    processed_flights = []
    for item in raw_list:
        date_str = item["date_str"]
        calc_year = item.get("calc_year", datetime.now().year)
        etd_z, eta_z = item["etd_z"].replace(":", ""), item["eta_z"].replace(":", "")
        
        time_string = f"{calc_year}-{date_str.split('.')[1]}-{date_str.split('.')[0]} {etd_z[:2]}:{etd_z[2:]}"
        etd_z_dt = datetime.strptime(time_string, "%Y-%m-%d %H:%M")
        
        eta_string = f"{calc_year}-{date_str.split('.')[1]}-{date_str.split('.')[0]} {eta_z[:2]}:{eta_z[2:]}"
        eta_z_dt = datetime.strptime(eta_string, "%Y-%m-%d %H:%M")
        if eta_z_dt < etd_z_dt: eta_z_dt += timedelta(days=1)
            
        etd_k_dt = etd_z_dt + timedelta(hours=9)
        eta_k_dt = eta_z_dt + timedelta(hours=9)
        
        ofp_target_dt = etd_k_dt - timedelta(hours=3, minutes=50)
        briefing_dt = etd_k_dt - timedelta(hours=1, minutes=20)
        
# 🌟 새롭게 적용된 실무 맞춤형 플랜 기준 로직 (교대시간 + 준비시간 기준)
        t_val = etd_k_dt.time()
        
        # 교대조별 플랜 마지노선 정의
        t_0300 = datetime.strptime("03:00", "%H:%M").time() # 오후조 담당 끝
        t_1050 = datetime.strptime("10:50", "%H:%M").time() # 야간조 담당 끝
        t_1820 = datetime.strptime("18:20", "%H:%M").time() # 오전조 담당 끝
        
        DOMESTIC_NUMS = {'601', '602', '609', '610', '613', '614'}
        DOM_G1 = {'601', '602'}
        
        if item["num_only"] in DOMESTIC_NUMS:
            # 🌟 국내선 예외 처리
            if item["num_only"] in DOM_G1:
                shift_code = "night"
                # 601, 602는 전날 야간조가 플랜 및 전체 ATC 제출
                shift_date = (etd_k_dt - timedelta(days=1)).strftime("%Y-%m-%d")
            else:
                shift_code = "morning"
                # 609~614는 당일 오전조가 플랜 진행
                shift_date = etd_k_dt.strftime("%Y-%m-%d")
        else:
            # 🌟 국제선 (교대시간 기준 오프셋 적용)
            if t_0300 <= t_val < t_1050:
                shift_code = "night"
                # 03:00~10:49 출발편은 전날 출근한 야간조가 10시 50분 이전까지 플랜
                shift_date = (etd_k_dt - timedelta(days=1)).strftime("%Y-%m-%d")
            elif t_1050 <= t_val < t_1820:
                shift_code = "morning"
                # 10:50~18:19 출발편은 당일 오전조가 18시 20분 이전까지 플랜
                shift_date = etd_k_dt.strftime("%Y-%m-%d")
            else:
                shift_code = "afternoon"
                # 18:20~02:59 출발편은 오후조가 03시 00분 이전까지 플랜
                if t_val < t_0300:
                    shift_date = (etd_k_dt - timedelta(days=1)).strftime("%Y-%m-%d")
                else:
                    shift_date = etd_k_dt.strftime("%Y-%m-%d")

        # 브리핑 시간은 실제 브리핑을 수행하는 시간대(06:30, 14:30, 22:30 교대)를 기준으로 엄격히 판별
        brf_time_val = briefing_dt.time()
        if datetime.strptime("06:30", "%H:%M").time() <= brf_time_val < datetime.strptime("14:30", "%H:%M").time(): 
            brf_shift_code = "morning"
        elif datetime.strptime("14:30", "%H:%M").time() <= brf_time_val < datetime.strptime("22:30", "%H:%M").time(): 
            brf_shift_code = "afternoon"
        else: 
            brf_shift_code = "night"

        altn_print = "RKSI" if item["arr"] == "CJJ" and 1230 <= int(eta_z) <= 2200 else "RKSS" if item["arr"] == "CJJ" else ""

        leg_db = FLIGHT_DB.get(item["num_only"], DEFAULT_FLIGHT)
        is_vietnam = item["arr"] in ['DAD', 'CXR'] or item["dep"] in ['DAD', 'CXR']
        is_outbound = leg_db["type"] == "out" or leg_db["type"] == ""

        code = get_dow_code(item["dep"], item["arr"])
        dow_val = f"{code}<br>{DOW_DB.get(item['reg'], {}).get(code, '')}"

        dest = item["arr"] if is_outbound else item["dep"]
        tank_type, tank_val = "", ""
        for key, dests in TANKERING_DB.items():
            if dest in dests:
                if key == "1000KG": tank_type, tank_val = "T", "-1300"
                elif key == "1500KG": tank_type, tank_val = "T", "-1800"
                elif key == "1600KG": tank_type, tank_val = "T", "-1900"
                elif key == "FULL": tank_type, tank_val = "FT", "+300"

        mel_str = "<br>".join(mel_db.get(item["reg"], [])[:5])
        taxi_fuel = TAXI_FUEL_DB.get(item["dep"], "")

        target_airport = item["dep"]
        target_time_dt = etd_z_dt
        
        fcst_temp, fcst_qnh, fcst_rwy, fcst_cond, wind_dir, wind_spd = get_forecast_for_time(target_airport, target_time_dt)
        
        weather_str = "" # 🌟 weather_str을 따로 표시하지 않고 바람장미 내부에 통합

        rwys = RWY_DB.get(item["dep"], ["", ""])
        
        def generate_wind_rose(rwys, w_dir, w_spd, predicted_rwy, cond, temp, qnh):
            if not rwys or not rwys[0]: return ""
            hdg1 = 0
            try: hdg1 = int(re.sub(r'\D', '', rwys[0])) * 10
            except: pass
            
            # SVG parameters: Center is 0,0, viewBox is -35 -35 70 70
            svg = '<svg width="42" height="42" viewBox="-35 -35 70 70" style="display:block; margin:0 auto; overflow:visible;">'
            
            # Runway group rotated to heading
            svg += f'<g transform="rotate({hdg1})">'
            svg += '<rect x="-3" y="-22" width="6" height="44" fill="#a0a0a0" rx="1" />'
            svg += '</g>'
            
            def get_pos(angle, r):
                rad = math.radians(angle)
                return r * math.sin(rad), -r * math.cos(rad)
            
            # Text at ends
            l1_x, l1_y = get_pos(hdg1 - 180, 29)
            l2_x, l2_y = get_pos(hdg1, 29)
            
            c1 = "#142a59" if rwys[0] == predicted_rwy else "#888"
            fw1 = "bold" if rwys[0] == predicted_rwy else "normal"
            c2 = "#142a59" if len(rwys)>1 and rwys[1] == predicted_rwy else "#888"
            fw2 = "bold" if len(rwys)>1 and rwys[1] == predicted_rwy else "normal"
            
            svg += f'<text x="{l1_x}" y="{l1_y}" font-size="10" font-weight="{fw1}" fill="{c1}" text-anchor="middle" dominant-baseline="central">{rwys[0]}</text>'
            if len(rwys) > 1 and rwys[1]:
                svg += f'<text x="{l2_x}" y="{l2_y}" font-size="10" font-weight="{fw2}" fill="{c2}" text-anchor="middle" dominant-baseline="central">{rwys[1]}</text>'
            
            # Wind arrow
            wind_str = ""
            wind_color = "#94a3b8" # 은은하고 차분한 슬레이트 그레이 (<=15KT)
            if w_spd not in (None, "") and float(w_spd) > 15:
                wind_color = "#d93025" # 강렬한 붉은색 (>15KT)
                
            if w_dir not in (None, "") and w_spd not in (None, ""):
                w_dir_rounded = int(round(float(w_dir) / 10.0) * 10)
                if w_dir_rounded == 0 and float(w_spd) > 0: w_dir_rounded = 360
                elif w_dir_rounded == 0: w_dir_rounded = 0
                elif w_dir_rounded == 360 and float(w_spd) == 0: w_dir_rounded = 0
                
                svg += f'<g transform="rotate({w_dir})">'
                svg += f'<line x1="0" y1="-34" x2="0" y2="-14" stroke="{wind_color}" stroke-width="2.5" />'
                svg += f'<polygon points="-4,-19 4,-19 0,-12" fill="{wind_color}" />'
                svg += '</g>'
                wind_str = f"{w_dir_rounded:03d}/{int(w_spd):02d}KT"
                
            svg += '</svg>'
            
            cond_str = "DRY" if cond == "D" else ("WET" if cond == "W" else ("ICE" if cond == "C" else cond))
            
            # 노면 상태에 따른 텍스트 색상
            text_color = "#a3c2e6" # DRY (연한 파란색)
            if cond == "W": text_color = "#fdba74" # WET (연한 주황색)
            elif cond == "C": text_color = "#fca5a5" # ICE (연한 빨간색)
            
            rwy_text = f"R{predicted_rwy}" if predicted_rwy else ""
            temp_str = ""
            if temp != "":
                t_val = int(temp)
                temp_str = f"T+{t_val}" if t_val > 0 else f"T{t_val}"
                
            qnh_str = f"Q{str(int(qnh))[-2:]}" if qnh != "" else ""
            
            html = f'''
            <div style="display:flex; justify-content:center; align-items:center; gap:8px;">
                <div style="text-align:center;">
                    {svg}
                    <div style="font-size:10px; font-weight:bold; color:{wind_color}; margin-top:2px; letter-spacing:-0.5px;">{wind_str}</div>
                </div>
            '''
            if temp_str or qnh_str:
                html += f'''
                <div style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; font-size:8.5px; font-weight:bold; color:{text_color}; line-height:1.1; margin-left:1px; margin-bottom: 2px;">
                    <div>{rwy_text}</div>
                    <div>{cond_str}</div>
                    <div>{temp_str}</div>
                    <div>{qnh_str}</div>
                </div>
                '''
            html += '</div>'
            return html
            
        rwy_html = generate_wind_rose(rwys, wind_dir, wind_spd, fcst_rwy, fcst_cond, fcst_temp, fcst_qnh)
        
        # 기장님 이름 체크
        upper_cpt = item["cpt"].strip().upper()
        # 정규표현식으로 다중 공백을 하나의 공백으로 치환해서 체크
        formatted_cpt_name = re.sub(r'\s+', ' ', upper_cpt)
        is_target_cpt = formatted_cpt_name in TARGET_CPTS
        
        processed_flights.append({
            "num_only": item["num_only"], "is_outbound": is_outbound, "is_from_aar": item.get("is_from_aar", True),
            "flt_num": item["flt_num"], "dep": item["dep"], "arr": item["arr"],
            "route": f"{item['dep']} - {item['arr']}", "reg": item["reg"], "cpt": item["cpt"],
            "etd_z": f"{etd_z[:2]}:{etd_z[2:]}", "eta_z": f"{eta_z[:2]}:{eta_z[2:]}",
            "etd_k": etd_k_dt.strftime("%H:%M"), "eta_k": eta_k_dt.strftime("%H:%M"),
            "briefing_time": briefing_dt.strftime("%H:%M"), "briefing_shift_code": brf_shift_code, 
            "shift_date": shift_date, "shift_code": shift_code,
            "altn_print": altn_print, "remarks": leg_db.get("remarks", ""), "pax_remark": leg_db.get("pax_remark", ""),
            "need_atch": is_outbound and not is_vietnam,
            "dow": dow_val, "tank_type": tank_type, "tank_val": tank_val,
            "mel_str": mel_str, "mel_footnotes": mel_footnotes_db.get(item["reg"], []), "taxi_fuel": taxi_fuel, 
            "rwy_html": rwy_html, "weather_str": weather_str, "is_target_cpt": is_target_cpt,
            "_etd_k_dt": etd_k_dt, "pair_id": item["pair_id"] 
        })
        
    DOMESTIC_NUMS = {'601', '602', '609', '610', '613', '614'}
    DOM_G1 = {'601', '602'}
    
    dom_flights, intl_flights = [], []
    for f in processed_flights:
        if f["num_only"] in DOMESTIC_NUMS: dom_flights.append(f)
        else: intl_flights.append(f)
            
    final_list = []
    dom_groups = defaultdict(list)
    for f in dom_flights:
        local_date = f["_etd_k_dt"].date().strftime("%Y-%m-%d")
        g_idx = "G1" if f["num_only"] in DOM_G1 else "G2"
        dom_groups[f"{local_date}_{g_idx}"].append(f)
        
    for group_key, group in dom_groups.items():
        group.sort(key=lambda x: x["_etd_k_dt"]) 
        if not group: continue
        
        first_flt = group[0]
        mega_pair_id = f"DOM_{group_key}"
        sort_time = first_flt["_etd_k_dt"].strftime("%Y%m%d%H%M")
        master_shift_code = first_flt["shift_code"]
        master_shift_date = first_flt["shift_date"]
        master_brf_shift_code = first_flt["briefing_shift_code"] 
        
        for i, f in enumerate(group):
            f["pair_id"] = mega_pair_id
            f["sort_time"] = sort_time 
            f["shift_code"] = master_shift_code 
            f["shift_date"] = master_shift_date
            f["briefing_shift_code"] = master_brf_shift_code 
            f["is_domestic"] = True
            f["dom_idx"] = i
            f["dom_total"] = len(group)
            final_list.append(f)
            
    intl_groups = defaultdict(list)
    for f in intl_flights: intl_groups[f["pair_id"]].append(f)
        
    for pid, group in intl_groups.items():
        group.sort(key=lambda x: 0 if x.get("is_outbound") else 1)
        sort_time = group[0]["_etd_k_dt"].strftime("%Y%m%d%H%M")
        for f in group:
            f["sort_time"] = sort_time
            f["is_domestic"] = False
            final_list.append(f)
            
    final_list.sort(key=lambda x: (x["sort_time"], x.get("dom_idx", 0 if x.get("is_outbound") else 1)))
    return final_list