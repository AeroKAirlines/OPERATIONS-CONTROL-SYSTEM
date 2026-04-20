from pydantic import BaseModel
from typing import List

class AdminPdfRequest(BaseModel):
    id: str
    base_time: str
    base_stand: str

class AdminAarRequest(BaseModel):
    id: str
    aar_time: str
    aar_reg: str

class AdminPdfBulkRequest(BaseModel):
    updates: List[AdminPdfRequest]

class AdminAarBulkRequest(BaseModel):
    updates: List[AdminAarRequest]

class LiveUpdateRequest(BaseModel):
    id: str
    manual_time: str
    manual_stand: str
    manual_reg: str
    tow_offset: int