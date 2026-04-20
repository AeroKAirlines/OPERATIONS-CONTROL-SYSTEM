from fastapi import APIRouter, Request, Response, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from backend.core.database import get_db
from backend.data_sources.common.models import PlanRamp
import urllib.request
import urllib.parse
import os
import logging
import json

logger = logging.getLogger("kac_proxy")

router = APIRouter()

# KAC API Key (테스트에서 작동했던 키를 기본값으로 적용했습니다)
KAC_SERVICE_KEY = os.environ.get("KAC_SERVICE_KEY", "765e42c1377bd70582576a54cc3c9a674ce76b10c4eedb906c8031ab68dc2378")

# 🌟[새로 추가됨] 상세 FIDS 정보 프록시 API
@router.get("/detail")
def proxy_kac_detail(schDate: str, schAirCode: str = "CJJ", db: Session = Depends(get_db)):
    params = {
        "page": 1,
        "perPage": 200,
        "serviceKey": KAC_SERVICE_KEY,
        "cond[AIRPORT::EQ]": schAirCode,
        "cond[FLIGHT_DATE::EQ]": schDate
    }
    
    query_string = urllib.parse.urlencode(params)
    # ODCloud 전용 주소
    url = f"https://api.odcloud.kr/api/FlightStatusListDTL/v1/getFlightStatusListDetail?{query_string}"
    
    try:
        req = urllib.request.Request(url)
        # ODCloud는 헤더에 키를 넣는 것을 권장합니다
        req.add_header("Authorization", f"Infuser {KAC_SERVICE_KEY}")
        
        with urllib.request.urlopen(req, timeout=10) as response:
            body = response.read()
            data = json.loads(body)
            
            # 🌟 RAMP DB 연동: PlanRamp 데이터를 조회하여 도착편 등의 GATE 값 업데이트
            if "data" in data and len(data["data"]) > 0:
                # schDate (YYYYMMDD) -> YYYY-MM-DD 포맷 변환
                formatted_date = f"{schDate[:4]}-{schDate[4:6]}-{schDate[6:8]}" if len(schDate) == 8 else schDate
                
                # PlanRamp에서 해당 일자의 데이터 가져오기
                ramp_plans = db.query(PlanRamp).filter(PlanRamp.flight_date == formatted_date).all()
                
                # flight_number와 flight_type(ARR/DEP) 기반으로 게이트 정보 매핑
                ramp_map = {}
                for plan in ramp_plans:
                    # RAMP DB는 ARR, DEP로 구분
                    key = f"{plan.flight_number}_{plan.flight_type}"
                    # manual_stand가 있으면 우선 적용, 없으면 base_stand 적용
                    gate_val = plan.manual_stand if plan.manual_stand else plan.base_stand
                    if gate_val:
                        ramp_map[key] = str(gate_val).replace('번', '').strip()

                # KAC API 응답 데이터에 RAMP DB 게이트 정보 병합
                for item in data["data"]:
                    flight_num = item.get("AIR_FLN")
                    io_type = "ARR" if item.get("IO") == "I" else "DEP"
                    
                    if flight_num:
                        key = f"{flight_num}_{io_type}"
                        ramp_gate = ramp_map.get(key)
                        
                        if io_type == "DEP":
                            # 출발편 디버깅용: KAC값/우리값 표기
                            kac_gate = item.get("GATE")
                            display_kac = str(kac_gate).strip() if kac_gate else "-"
                            display_ramp = str(ramp_gate).strip() if ramp_gate else "-"
                            item["GATE"] = f"{display_kac}/{display_ramp}"
                        else:
                            # 도착편은 KAC 데이터가 없으므로 우리 RAMP DB 값만 주입
                            if ramp_gate:
                                item["GATE"] = str(ramp_gate).strip()
            
            return JSONResponse(content=data)
            
    except Exception as e:
        import traceback
        logger.error(f"KAC Detail API 오류: {e}")
        return JSONResponse({"error": str(e), "trace": traceback.format_exc()}, status_code=500)

# 기존 API 프록시 (하위 호환성 유지용)
@router.get("/{path:path}")
def proxy_openapi(path: str, request: Request):
    query_params = dict(request.query_params)
    
    if "serviceKey" not in query_params and KAC_SERVICE_KEY:
        query_params["serviceKey"] = KAC_SERVICE_KEY
    
    query = urllib.parse.urlencode(query_params)
    url = f"http://openapi.airport.co.kr/service/rest/{path}?{query}"
    
    try:
        req = urllib.request.Request(url)
        req.add_header("Content-type", "application/json")
        with urllib.request.urlopen(req, timeout=10) as response:
            body = response.read()
            headers = dict(response.headers)
            headers.pop('Transfer-Encoding', None)
            headers.pop('Access-Control-Allow-Origin', None)
            return Response(content=body, status_code=response.getcode(), headers=headers)
            
    except Exception as e:
        import traceback
        logger.error(f"KAC API 프록시 오류: {e}")
        return JSONResponse({"error": str(e), "trace": traceback.format_exc()}, status_code=500)