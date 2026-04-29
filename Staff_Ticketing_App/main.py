from fastapi import FastAPI, Request, Query, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
import sys
from datetime import datetime, timedelta
try:
    from .fare_config import calculate_total_price
except ImportError:
    from fare_config import calculate_total_price

# Booking_App의 데이터를 가져오기 위해 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    import Booking_App.main as booking_main
except ImportError:
    booking_main = None

app = FastAPI(title="Aero K Staff Ticketing System")

base_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(base_dir, "static")
templates_dir = os.path.join(base_dir, "templates")
os.makedirs(static_dir, exist_ok=True)
os.makedirs(templates_dir, exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")
templates = Jinja2Templates(directory=templates_dir)

def get_flight_info(origin, dest, date_str):
    target_dest = dest if origin in ['CJJ', 'ICN'] else origin
    hub = "청주" if 'CJJ' in [origin, dest] else "인천"
    dir_key = "왕편" if origin in ['CJJ', 'ICN'] else "복편"
    
    flights = []
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        search_date = dt.strftime("%y-%m-%d")
    except:
        search_date = date_str

    if booking_main and not booking_main.cached_data:
        db_data = booking_main.load_data_from_db()
        if db_data:
            booking_main.cached_data = db_data

    cached_data = booking_main.cached_data if booking_main else {}
    if target_dest in cached_data:
        routes = cached_data[target_dest].get("routes", {}).get(hub, {}).get(dir_key, {})
        for f_no, f_data in routes.items():
            record = f_data.get("records", {}).get(search_date)
            if not record:
                continue
            lf_val = record.get("lf", 0)
            if isinstance(lf_val, str):
                lf_val = lf_val.replace('%', '')
            try:
                lf = float(lf_val)
            except ValueError:
                lf = 0.0
            
            if lf >= 100: status = "gray"
            elif lf >= 80: status = "red"
            elif lf >= 60: status = "yellow"
            else: status = "green"
            
            dep = f_data.get("dep", "-")
            arr = f_data.get("arr", "-")
            block_time = ""
            next_day = False
            
            if dep != "-" and arr != "-" and ":" in dep and ":" in arr:
                try:
                    dep_h, dep_m = map(int, dep.split(':'))
                    arr_h, arr_m = map(int, arr.split(':'))
                    dep_mins = dep_h * 60 + dep_m
                    arr_mins = arr_h * 60 + arr_m
                    if arr_mins < dep_mins:
                        arr_mins += 1440
                        next_day = True
                    diff = arr_mins - dep_mins
                    bh = diff // 60
                    bm = diff % 60
                    block_time = f"{bh}h {bm}m"
                except Exception:
                    pass
            
            flights.append({
                "flight_no": f_no,
                "dep": dep,
                "arr": arr,
                "block_time": block_time,
                "next_day": next_day,
                "lf": lf,
                "status": status
            })
            
    flights.sort(key=lambda x: x["dep"])
    
    return flights

def get_date_ribbon(origin, dest, center_date_str):
    try:
        center_dt = datetime.strptime(center_date_str, "%Y-%m-%d")
    except:
        center_dt = datetime.now()
    
    ribbon = []
    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    for i in range(-3, 4):
        dt = center_dt + timedelta(days=i)
        d_str = dt.strftime("%Y-%m-%d")
        display_day = dt.strftime("%d")
        display_wk = weekdays[dt.weekday()]
        
        # 간략한 평균 상태 구하기
        flights = get_flight_info(origin, dest, d_str)
        if flights:
            avg_lf = sum(f['lf'] for f in flights) / len(flights)
            if avg_lf >= 100: status_txt, status_color = "만석", "#757575"
            elif avg_lf >= 80: status_txt, status_color = "임박", "#c62828"
            elif avg_lf >= 60: status_txt, status_color = "혼잡", "#f57c00"
            else: status_txt, status_color = "여유", "#2e7d32"
        else:
            status_txt, status_color = "-", "#999"
            
        ribbon.append({
            "date": d_str,
            "display_day": display_day,
            "display_wk": display_wk,
            "status_txt": status_txt,
            "status_color": status_color,
            "is_active": (i == 0)
        })
    return ribbon

@app.get("/search", response_class=HTMLResponse)
async def search_flights(
    request: Request,
    origin: str = Query("CJJ"),
    dest: str = Query(""),
    date1: str = Query(""),
    date2: str = Query(""),
    tripType: str = Query("rt"),
    ticket_class: str = Query("SUBLO"),
    pax_count: str = Query("1")
):
    if not date1:
        date1 = datetime.now().strftime("%Y-%m-%d")
    
    outbound_flights = get_flight_info(origin, dest, date1)
    ob_ribbon = get_date_ribbon(origin, dest, date1)
    
    inbound_flights = []
    ib_ribbon = []
    if tripType == 'rt' and date2:
        inbound_flights = get_flight_info(dest, origin, date2)
        ib_ribbon = get_date_ribbon(dest, origin, date2)

    context = {
        "request": request,
        "origin": origin,
        "dest": dest,
        "date1": date1,
        "date2": date2,
        "tripType": tripType,
        "ticket_class": ticket_class,
        "pax_count": pax_count,
        "outbound_flights": outbound_flights,
        "ob_ribbon": ob_ribbon,
        "inbound_flights": inbound_flights,
        "ib_ribbon": ib_ribbon
    }
    return templates.TemplateResponse(request=request, name="search_result.html", context=context)

@app.post("/result", response_class=HTMLResponse)
async def booking_result(
    request: Request,
    origin: str = Form(...),
    dest: str = Form(...),
    date1: str = Form(...),
    date2: str = Form(""),
    tripType: str = Form(...),
    ticket_class: str = Form(...),
    pax_count: str = Form("1"),
    outbound_flight: str = Form(...),
    outbound_dep: str = Form(""),
    outbound_arr: str = Form(""),
    outbound_lf: float = Form(0.0),
    inbound_flight: str = Form(""),
    inbound_dep: str = Form(""),
    inbound_arr: str = Form(""),
    inbound_lf: float = Form(0.0)
):
    pax_cnt = int(pax_count)
    
    legs = [(origin, dest)]
    if tripType == 'rt' and inbound_flight:
        legs.append((dest, origin))
    # 다구간(MD)의 경우 여기서 다루진 않지만, 확장을 위해 list of legs 사용
        
    prices = calculate_total_price(legs, ticket_class, pax_cnt)
    
    def get_lf_status(lf, tc):
        if tc == "DUTY" or tc == "BIZ":
            return {"text": "확약(CONFIRM)", "color": "bg-green"}
        if lf >= 100: return {"text": "만석", "color": "bg-gray"}
        elif lf >= 80: return {"text": "임박", "color": "bg-red"}
        elif lf >= 60: return {"text": "혼잡", "color": "bg-yellow"}
        else: return {"text": "여유", "color": "bg-green"}

    ob_status = get_lf_status(outbound_lf, ticket_class)
    ib_status = get_lf_status(inbound_lf, ticket_class) if inbound_flight else {}
    
    context = {
        "request": request,
        "origin": origin, "dest": dest, "date1": date1, "date2": date2,
        "tripType": tripType, "ticket_class": ticket_class, "pax_count": pax_count,
        "outbound_flight": outbound_flight, "outbound_dep": outbound_dep, "outbound_arr": outbound_arr, "outbound_lf": outbound_lf, "ob_status": ob_status,
        "inbound_flight": inbound_flight, "inbound_dep": inbound_dep, "inbound_arr": inbound_arr, "inbound_lf": inbound_lf, "ib_status": ib_status,
        "fare": prices["fare"], "tax": prices["tax"], "has_unknown_tax": prices["has_unknown_tax"], "total_price": prices["total"]
    }
    return templates.TemplateResponse(request=request, name="booking_result.html", context=context)
