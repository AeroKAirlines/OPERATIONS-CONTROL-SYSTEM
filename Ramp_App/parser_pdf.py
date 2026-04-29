import pdfplumber
import pandas as pd
import re
from datetime import datetime

def parse_draft_pdf(file_bytes_list, base_year=None):
    if not file_bytes_list:
        return []

    current_date = datetime.now()
    if base_year is None:
        base_year = current_date.year
    current_month = current_date.month
        
    structured_data = []
    
    for file_bytes in file_bytes_list:
        with pdfplumber.open(file_bytes) as pdf:
            for page in pdf.pages:
                # 🌟 수학적 좌표 계산 폐기. 화면에 보이는 여백을 그대로 유지하여 추출
                text = page.extract_text(layout=True)
                if not text:
                    continue
                    
                lines = text.split('\n')
                current_dates = []
                col_bounds = []
                
                for line in lines:
                    # 1. 날짜 헤더 찾기 (예: 4/2)
                    if not col_bounds:
                        dates = []
                        # 앞뒤에 다른 숫자가 없는 순수한 날짜 형식만 추출
                        for m in re.finditer(r'(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)', line):
                            m_int, d_int = int(m.group(1)), int(m.group(2))
                            if 1 <= m_int <= 12 and 1 <= d_int <= 31:
                                t_year = base_year + 1 if (current_month >= 11 and m_int <= 2) else (base_year - 1 if (current_month <= 2 and m_int >= 11) else base_year)
                                dates.append(f"{t_year}-{m_int:02d}-{d_int:02d}")
                        if dates:
                            current_dates = dates
                            continue
                            
                    # 2. 도착/출발 글자 위치를 기준으로 보이지 않는 기둥(Boundary) 세우기
                    if current_dates and not col_bounds and ("도착" in line or "출발" in line):
                        headers = []
                        # 글씨가 시작되는 정확한 문자(Index) 위치를 기록
                        for m in re.finditer(r'(도착|출발)', line):
                            headers.append({'type': 'ARR' if m.group(1) == '도착' else 'DEP', 'pos': m.start()})
                            
                        if len(headers) >= 2:
                            for i in range(len(headers)):
                                # 이전 헤더와 현재 헤더 사이의 정중앙을 경계선으로 나눔
                                start_pos = 0 if i == 0 else (headers[i-1]['pos'] + headers[i]['pos']) // 2
                                end_pos = 9999 if i + 1 == len(headers) else (headers[i]['pos'] + headers[i+1]['pos']) // 2
                                date_idx = i // 2
                                target_date = current_dates[date_idx] if date_idx < len(current_dates) else current_dates[-1]
                                
                                col_bounds.append({
                                    'type': headers[i]['type'], 
                                    'start': start_pos, 
                                    'end': end_pos, 
                                    'date': target_date
                                })
                        continue
                        
                    # 3. 비행기 데이터 추출 (어느 기둥 사이에 글씨가 위치했는지 검사)
                    if col_bounds and re.search(r'\d{2}:\d{2}', line):
                        # 정규식: 편명(RF121F 포함) + 목적지 + 시간(00:00) + 주기장
                        for m in re.finditer(r'([A-Z0-9]{2}\d{1,4}[A-Z]?)\s+([가-힣A-Za-z]+)\s+(\d{2}:\d{2})\s+([0-9A-Z-]+)', line):
                            pos = m.start() # 이 비행기 데이터가 시작되는 정확한 문자 위치
                            flight = m.group(1)
                            city = m.group(2)
                            time_str = m.group(3)
                            stand = m.group(4)
                            
                            # 비행기 글자 위치가 어느 방(도착/출발/날짜)에 속하는지 대조
                            for col in col_bounds:
                                if col['start'] <= pos < col['end']:
                                    structured_data.append({
                                        "FLIGHT": flight,
                                        "TYPE": col['type'],
                                        "DATETIME_KST": f"{col['date']} {time_str}",
                                        "CITY": city,
                                        "STAND": stand
                                    })
                                    break

    df = pd.DataFrame(structured_data)
    if not df.empty:
        df = df.drop_duplicates().sort_values(by="DATETIME_KST")
        return df.to_dict(orient='records')
        
    return []