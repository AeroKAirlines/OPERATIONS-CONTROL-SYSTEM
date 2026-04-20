from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.data_sources.common.models import PlanRamp, MasterFlight
from backend.apps.ramp.models import EventLog
from backend.apps.auth.models import User
from backend.apps.ramp.schemas import LiveUpdateRequest
from backend.apps.ramp.services import build_timeline_items
from backend.core.security import get_current_user

router = APIRouter()

@router.get("/schedules")
async def get_schedules_endpoint(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        flights = db.query(PlanRamp).filter(
            PlanRamp.flight_date >= start_date,
            PlanRamp.flight_date <= end_date
        ).all()

        timeline_items = build_timeline_items(flights)

        return JSONResponse(content={
            "status": "success", 
            "data": {"timeline": {"items": timeline_items}}
        })
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

@router.post("/live/update")
async def update_live_schedule(
    req: LiveUpdateRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        db_flight = db.query(PlanRamp).filter(PlanRamp.id == req.id).first()
        if not db_flight:
            return JSONResponse(content={"status": "error", "message": "스케줄을 찾을 수 없습니다."})

        # 3단계(Manual) 컬럼에 수동 개입 데이터 저장!

        db_flight.manual_time = req.manual_time
        db_flight.manual_stand = req.manual_stand
        db_flight.manual_reg = req.manual_reg
        db_flight.tow_offset = req.tow_offset

        # 1->2->3 단계를 거친 spot 정보를 MasterFlight로 전송 (에어로케이인 경우만)
        if db_flight.is_rf:
            master_record = db.query(MasterFlight).filter(MasterFlight.id == db_flight.master_id).first()
            if master_record:
                active_stand = db_flight.manual_stand if db_flight.manual_stand else db_flight.base_stand
                if db_flight.flight_type == 'DEP':
                    master_record.dep_gate = active_stand
                elif db_flight.flight_type == 'ARR':
                    master_record.arr_gate = active_stand



        payload = {
            "time": req.manual_time, "stand": req.manual_stand, 
            "reg": req.manual_reg, "tow_offset": req.tow_offset
        }

        db.add(EventLog(
            flight_id=req.id, 
            event_type="MANUAL_UPDATE", 
            worker=current_user.full_name, 
            payload=payload
        ))
        db.commit()
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        db.rollback()
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)