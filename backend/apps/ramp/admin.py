from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.data_sources.common import models
from backend.data_sources.common.models import MasterFlight
from backend.apps.auth.models import User
from backend.apps.ramp.schemas import AdminPdfRequest, AdminAarRequest, AdminPdfBulkRequest, AdminAarBulkRequest
from backend.core.security import get_current_user  # JWT 인증용

router = APIRouter()

@router.get("/schedules")
async def get_admin_schedules(
    start_date: str = Query(...), 
    end_date: str = Query(...), 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        flights = db.query(models.PlanRamp).filter(
            models.PlanRamp.flight_date >= start_date, 
            models.PlanRamp.flight_date <= end_date
        ).order_by(models.PlanRamp.flight_date, models.PlanRamp.flight_number).all()
        
        data =[{
            "id": f.id, 
            "flight_date": f.flight_date, 
            "flight_number": f.flight_number, 
            "flight_type": f.flight_type,
            "base_time": f.base_time or "", 
            "base_stand": f.base_stand or "",
            "aar_time": f.aar_time or "", 
            "aar_reg": f.aar_reg or "UNKNOWN"
        } for f in flights]
            
        return JSONResponse(content={"status": "success", "data": data})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


@router.delete("/delete/{flight_id}")
async def delete_admin_schedule(
    flight_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        db_flight = db.query(models.PlanRamp).filter(models.PlanRamp.id == flight_id).first()
        if db_flight:
            db.delete(db_flight)
            db.commit()
        return JSONResponse(content={"status": "success"})
    except Exception as e:
        db.rollback()
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


@router.post("/update_pdf_bulk")
async def update_admin_pdf_bulk(
    req: AdminPdfBulkRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        for update in req.updates:
            db_flight = db.query(models.PlanRamp).filter(models.PlanRamp.id == update.id).first()
            if db_flight:
                db_flight.base_time = update.base_time
                db_flight.base_stand = update.base_stand
                # PDF 업데이트 시 (1차) MasterFlight 에도 임시로 반영 (Aero K 한정)
                if db_flight.is_rf or str(db_flight.flight_number).upper().startswith('EOK'):
                    master = db.query(MasterFlight).filter(MasterFlight.id == db_flight.master_id).first()
                    if master:
                        active_stand = getattr(db_flight, "manual_stand", "")
                        if not active_stand:
                            active_stand = update.base_stand
                        
                        if db_flight.flight_type == 'DEP':
                            master.dep_gate = active_stand
                        elif db_flight.flight_type == 'ARR':
                            master.arr_gate = active_stand

        db.commit()
        return JSONResponse(content={"status": "success", "message": f"{len(req.updates)}건 수정 완료"})
    except Exception as e:
        db.rollback()
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


@router.post("/update_aar_bulk")
async def update_admin_aar_bulk(
    req: AdminAarBulkRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        for update in req.updates:
            db_flight = db.query(models.PlanRamp).filter(models.PlanRamp.id == update.id).first()
            if db_flight:
                db_flight.aar_time = update.aar_time
                db_flight.aar_reg = update.aar_reg
                # AAR 업데이트 시 (2차) 기번을 MasterFlight에 반영
                if db_flight.is_rf or str(db_flight.flight_number).upper().startswith('EOK'):
                    master = db.query(MasterFlight).filter(MasterFlight.id == db_flight.master_id).first()
                    if master and update.aar_reg != 'UNKNOWN':
                        master.aircraft_reg = update.aar_reg

        db.commit()
        return JSONResponse(content={"status": "success", "message": f"{len(req.updates)}건 수정 완료"})
    except Exception as e:
        db.rollback()
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)