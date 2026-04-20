import pandas as pd
from datetime import datetime, timedelta
import re

def parse_rf_msg(msg_text: str, base_year: int = None):
    # 🌟 연말-연초 경계 처리 로직 포함
    current_date = datetime.now()
    if base_year is None:
        base_year = current_date.year
    current_month = current_date.month
        
    lines = msg_text.strip().split('\n')
    parsed_data =[]

    for line in lines:
        if re.match(r'^\d{2}\.\d{2}\s+[A-Z0-9]+\s+[A-Z]{3}', line.strip()):
            parts = line.split()
            if len(parts) >= 9:
                date_str = parts[0]   
                flight = parts[1]     
                dep = parts[2]        
                arr = parts[3]        
                etd_z = parts[4]      
                eta_z = parts[5]      
                reg = parts[6]        

                day, month = map(int, date_str.split('.'))
                
                # 🌟 현재 11~12월인데 파싱된 데이터가 1~2월이면 내년으로 보정
                target_year = base_year
                if current_month >= 11 and month <= 2:
                    target_year += 1
                # 드물지만 현재 1~2월인데 작년 말 스케줄을 조회할 때를 대비
                elif current_month <= 2 and month >= 11:
                    target_year -= 1
                
                etd_time_z = datetime(target_year, month, day, int(etd_z[:2]), int(etd_z[2:]))
                etd_time_kst = etd_time_z + timedelta(hours=9)

                eta_time_z = datetime(target_year, month, day, int(eta_z[:2]), int(eta_z[2:]))
                if eta_time_z < etd_time_z:
                    eta_time_z += timedelta(days=1)
                eta_time_kst = eta_time_z + timedelta(hours=9)

                parsed_data.append({
                    "REG": reg,
                    "FLIGHT": flight,
                    "DEP": dep,
                    "ARR": arr,
                    "ETD_KST": etd_time_kst.strftime("%Y-%m-%d %H:%M"),
                    "ETA_KST": eta_time_kst.strftime("%Y-%m-%d %H:%M")
                })

    df = pd.DataFrame(parsed_data)
    if not df.empty:
        df = df.drop_duplicates(subset=['REG', 'FLIGHT', 'ETD_KST'])
        return df.to_dict(orient='records')
        
    return[]