import pandas as pd

def analyze_schedules(pdf_data, msg_data):
    df_pdf = pd.DataFrame(pdf_data) if pdf_data else pd.DataFrame(columns=["FLIGHT", "TYPE", "DATETIME_KST", "CITY", "STAND"])
    df_msg = pd.DataFrame(msg_data) if msg_data else pd.DataFrame()
    
    if df_pdf.empty and df_msg.empty:
        return {"timeline": {"groups":[], "items":[]}}

    flight_to_msg = {}
    if not df_msg.empty:
        for _, row in df_msg.iterrows():
            date_str = row['ETA_KST'][:10] if row['ARR'] == 'CJJ' else row['ETD_KST'][:10]
            key = f"{row['FLIGHT']}_{date_str}"
            flight_to_msg[key] = row

    pdf_keys = set()
    if not df_pdf.empty:
        for _, row in df_pdf.iterrows():
            pdf_keys.add(f"{row['FLIGHT']}_{row['DATETIME_KST'][:10]}_{row['TYPE']}")
            
    msg_synth =[]
    if not df_msg.empty:
        for _, row in df_msg.iterrows():
            if row['ARR'] == 'CJJ':
                k_arr = f"{row['FLIGHT']}_{row['ETA_KST'][:10]}_ARR"
                if k_arr not in pdf_keys:
                    msg_synth.append({"FLIGHT": row['FLIGHT'], "TYPE": "ARR", "DATETIME_KST": row['ETA_KST'], "AAR_TIME": row['ETA_KST'], "CITY": row['DEP'], "STAND": "미정", "REG": row['REG']})
            if row['DEP'] == 'CJJ':
                k_dep = f"{row['FLIGHT']}_{row['ETD_KST'][:10]}_DEP"
                if k_dep not in pdf_keys:
                    msg_synth.append({"FLIGHT": row['FLIGHT'], "TYPE": "DEP", "DATETIME_KST": row['ETD_KST'], "AAR_TIME": row['ETD_KST'], "CITY": row['ARR'], "STAND": "미정", "REG": row['REG']})
                    
    if msg_synth:
        df_pdf = pd.concat([df_pdf, pd.DataFrame(msg_synth)], ignore_index=True)

    df_pdf['DATETIME'] = pd.to_datetime(df_pdf['DATETIME_KST'])
    df_pdf = df_pdf.sort_values('DATETIME')
    
    df_rf = df_pdf[df_pdf['FLIGHT'].str.startswith('RF')].copy()
    df_other = df_pdf[~df_pdf['FLIGHT'].str.startswith('RF')].copy()

    if not df_rf.empty:
        def get_msg_attr(row, attr):
            key = f"{row['FLIGHT']}_{row['DATETIME_KST'][:10]}"
            msg_row = flight_to_msg.get(key)
            if isinstance(msg_row, pd.Series):
                return msg_row.get(attr, None)
            return None
            
        df_rf['REG'] = df_rf.apply(lambda r: r.get('REG') if pd.notna(r.get('REG')) else (get_msg_attr(r, 'REG') or "UNKNOWN"), axis=1)
        
        def get_aar_time(row):
            if 'AAR_TIME' in row and pd.notna(row['AAR_TIME']):
                return row['AAR_TIME']
            key = f"{row['FLIGHT']}_{row['DATETIME_KST'][:10]}"
            msg_row = flight_to_msg.get(key)
            if msg_row is not None and isinstance(msg_row, pd.Series):
                return msg_row['ETA_KST'] if row['TYPE'] == 'ARR' else msg_row['ETD_KST']
            return row['DATETIME_KST']
            
        df_rf['AAR_TIME'] = df_rf.apply(get_aar_time, axis=1)
        
        def get_city(row):
            key = f"{row['FLIGHT']}_{row['DATETIME_KST'][:10]}"
            msg_row = flight_to_msg.get(key)
            if msg_row is not None and isinstance(msg_row, pd.Series):
                return msg_row['DEP'] if row['TYPE'] == 'ARR' else msg_row['ARR']
            return row.get('CITY', '')
            
        df_rf['CITY'] = df_rf.apply(get_city, axis=1)

    if not df_other.empty:
        other_regs = {}
        pseudo_reg_counter = 1
        waiting = {}
        
        # 도착(ARR)을 먼저 처리하도록 정렬 (동일 시간대 꼬임 방지)
        df_other = df_other.copy()
        df_other['TYPE_SORT'] = df_other['TYPE'].map({'ARR': 0, 'DEP': 1})
        df_other = df_other.sort_values(['DATETIME', 'TYPE_SORT'])
        
        for idx, row in df_other.iterrows():
            is_arr = (row['TYPE'] == 'ARR')
            airline = str(row['FLIGHT']).strip()[:2]
            raw_stand = str(row['STAND']).strip()
            current_time = row['DATETIME']
            
            if airline not in waiting:
                waiting[airline] = {}
                
            if is_arr:
                # 1-4 이면 도착 후 최종 주차는 4번
                park_stand = raw_stand.split('-')[-1].strip()
                if park_stand not in waiting[airline]:
                    waiting[airline][park_stand] = []
                waiting[airline][park_stand].append((idx, current_time))
            else:
                # 4-1 이면 출발 시작은 4번
                start_stand = raw_stand.split('-')[0].strip()
                matched = False
                
                # 같은 항공사 & 같은 주기장에 도착해 있는 편들 중 가장 먼저 도착한 것과 매칭
                if start_stand in waiting[airline] and len(waiting[airline][start_stand]) > 0:
                    for i, (arr_idx, arr_time) in enumerate(waiting[airline][start_stand]):
                        if arr_time <= current_time:
                            waiting[airline][start_stand].pop(i)
                            
                            reg_name = f"OTHER_{pseudo_reg_counter}"
                            other_regs[arr_idx] = reg_name
                            other_regs[idx] = reg_name
                            pseudo_reg_counter += 1
                            matched = True
                            break
                            
                if not matched:
                    # 짝을 못 찾은 경우 단독 배정
                    reg_name = f"OTHER_{pseudo_reg_counter}"
                    other_regs[idx] = reg_name
                    pseudo_reg_counter += 1
                    
        # 짝을 못 찾고 남은 도착편 처리
        for airline, stands in waiting.items():
            for stand, arrs in stands.items():
                for arr_idx, _ in arrs:
                    reg_name = f"OTHER_{pseudo_reg_counter}"
                    other_regs[arr_idx] = reg_name
                    pseudo_reg_counter += 1
                    
        df_other['REG'] = df_other.index.map(other_regs)
        df_other['AAR_TIME'] = df_other['DATETIME_KST'] 

    dfs_to_concat =[]
    if not df_rf.empty: dfs_to_concat.append(df_rf)
    if not df_other.empty: dfs_to_concat.append(df_other)
    
    if not dfs_to_concat:
        return {"timeline": {"groups": [], "items":[]}}
        
    df_all = pd.concat(dfs_to_concat).sort_values('DATETIME')

    timeline_items =[]
    timeline_groups_set = set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '12L', '12R', '13', '13L', '13R'])

    for reg, group in df_all.groupby('REG'):
        is_other = str(reg).startswith('OTHER_')
        is_active = False if reg == "UNKNOWN" else True
        
        for _, row in group.iterrows():
            raw_stand = str(row['STAND'])
            for p in raw_stand.split('-'):
                timeline_groups_set.add(p)
                
            clean_stand = raw_stand.split('-')[0] if row['TYPE'] == 'ARR' else (raw_stand.split('-')[1] if '-' in raw_stand else raw_stand)
            
            iso_original = row['DATETIME'].strftime('%Y-%m-%dT%H:%M:%S+09:00')
            
            try:
                iso_live = pd.to_datetime(row['AAR_TIME']).strftime('%Y-%m-%dT%H:%M:%S+09:00')
            except:
                iso_live = iso_original
                
            is_time_mod = (iso_live != iso_original)
            
            item_id = f"{row['TYPE']}_{row['FLIGHT']}_{row['DATETIME'].strftime('%Y-%m-%dT%H:%M:%S')}_{reg}"
            disp_content = str(row['FLIGHT']) if is_other else f"{reg if is_active else ''} {row['FLIGHT']}".strip()
            
            timeline_items.append({
                "id": item_id,
                "group": clean_stand,
                "start": iso_live,             
                "originalStart": iso_original, 
                "content": disp_content,
                "reg": reg,
                "flight": str(row['FLIGHT']),
                "city": str(row.get('CITY', '')),
                "type": "point",
                "flightType": row['TYPE'],
                "rawStand": raw_stand,
                "originalRawStand": raw_stand,
                "isOther": is_other,
                "isActive": is_active,
                "isModified": is_time_mod     
            })

    def sort_key(s):
        val = str(s)
        if val == '미정': return 9999.0
        if val.endswith('L'): return float(val[:-1]) + 0.1
        elif val.endswith('R'): return float(val[:-1]) + 0.2
        return float(val) if val.isdigit() else 998.0
        
    sorted_groups = sorted(list(timeline_groups_set), key=sort_key)
    timeline_groups =[{"id": g, "content": f"STAND {g}" if g != '미정' else "미정 (배정필요)", "order": sort_key(g)} for g in sorted_groups]

    return { "timeline": { "groups": timeline_groups, "items": timeline_items } }