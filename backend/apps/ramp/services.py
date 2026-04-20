def build_timeline_items(flights):
    timeline_items = []
    
    rf_flights =[f for f in flights if getattr(f, "is_rf", False) or str(f.flight_number).upper().startswith(("EOK", "RF"))]
    other_flights =[f for f in flights if not (getattr(f, "is_rf", False) or str(f.flight_number).upper().startswith(("EOK", "RF")))]
    
    # 1. 자사 (Aero K) 스케줄 처리
    for f in rf_flights:
        # 🌟 3단계 오버레이 완벽 적용! (Manual -> AAR -> Base 순서)
        live_time = f.manual_time or f.aar_time or f.base_time
        orig_time = f.base_time
        
        live_stand = f.manual_stand or f.base_stand
        orig_stand = f.base_stand
        live_reg = f.manual_reg or f.aar_reg
        
        group_val = live_stand.split('-')[0] if f.flight_type == 'ARR' else live_stand.split('-')[-1]
        
        is_active = True
        if live_reg == 'UNKNOWN':
            is_active = False

        timeline_items.append({
            "id": f.id,
            "group": group_val,
            "start": live_time,
            "originalStart": orig_time,
            "content": f"{live_reg if live_reg != 'UNKNOWN' else '[미배정]'} {f.flight_number}".strip(),
            "reg": live_reg,
            "flight": f.flight_number,
            "city": f.city,
            "type": "point",
            "flightType": f.flight_type,
            "rawStand": live_stand,
            "originalRawStand": orig_stand,
            "isActive": is_active,
            "isModified": live_time != orig_time or live_stand != orig_stand,
            "isOther": False,
            "towOffset": f.tow_offset
        })

    # 2. 타사 (Other) 스케줄 처리
    other_flights_sorted = sorted(other_flights, key=lambda x: (
        x.manual_time or x.base_time,
        0 if x.flight_type == 'ARR' else 1
    ))
    
    pseudo_reg_counter = 1
    waiting = {}
    other_regs = {}
    
    for f in other_flights_sorted:
        is_arr = f.flight_type == 'ARR'
        airline = f.flight_number[:2]
        live_stand = f.manual_stand or f.base_stand
        live_time = f.manual_time or f.base_time
        
        if airline not in waiting:
            waiting[airline] = {}
            
        if is_arr:
            park_stand = live_stand.split('-')[-1].strip()
            if park_stand not in waiting[airline]:
                waiting[airline][park_stand] = []
            waiting[airline][park_stand].append((f.id, live_time))
        else:
            start_stand = live_stand.split('-')[0].strip()
            matched = False
            
            if start_stand in waiting[airline] and len(waiting[airline][start_stand]) > 0:
                for i, (arr_id, arr_time) in enumerate(waiting[airline][start_stand]):
                    if arr_time <= live_time:
                        waiting[airline][start_stand].pop(i)
                        reg_name = f"OTHER_{pseudo_reg_counter}"
                        other_regs[arr_id] = reg_name
                        other_regs[f.id] = reg_name
                        pseudo_reg_counter += 1
                        matched = True
                        break
            if not matched:
                other_regs[f.id] = f"OTHER_{pseudo_reg_counter}"
                pseudo_reg_counter += 1

    for airline, stands in waiting.items():
        for stand, arrs in stands.items():
            for arr_id, _ in arrs:
                if arr_id not in other_regs:
                    other_regs[arr_id] = f"OTHER_{pseudo_reg_counter}"
                    pseudo_reg_counter += 1

    for f in other_flights_sorted:
        live_time = f.manual_time or f.base_time
        orig_time = f.base_time
        live_stand = f.manual_stand or f.base_stand
        orig_stand = f.base_stand
        group_val = live_stand.split('-')[0] if f.flight_type == 'ARR' else live_stand.split('-')[-1]
        live_reg = other_regs.get(f.id, f"OTHER_{pseudo_reg_counter}")

        timeline_items.append({
            "id": f.id, "group": group_val, "start": live_time, "originalStart": orig_time,
            "content": f.flight_number, "reg": live_reg, "flight": f.flight_number,
            "city": f.city, "type": "point", "flightType": f.flight_type,
            "rawStand": live_stand, "originalRawStand": orig_stand,
            "isActive": True, "isModified": live_time != orig_time or live_stand != orig_stand, "isOther": True
        })

    return timeline_items