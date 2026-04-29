from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import List
import io
import os
import sys

from Ramp_App.parser_msg import parse_rf_msg
from Ramp_App.parser_pdf import parse_draft_pdf
from Ramp_App.analyzer import analyze_schedules

# 🌟 PyInstaller로 EXE를 만들었을 때 내장된 static 폴더 경로를 찾는 함수
def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

app = FastAPI()

# 🌟 기존 마운트 코드를 resource_path를 사용하도록 변경
static_dir = "Ramp_App/static"
os.makedirs(static_dir, exist_ok=True)
app.mount("/ui", StaticFiles(directory=static_dir, html=True), name="static")

@app.post("/api/parse_pdf")
async def parse_pdf_endpoint(pdf_files: List[UploadFile] = File(...)):
    try:
        pdf_bytes_list =[io.BytesIO(await f.read()) for f in pdf_files]
        pdf_parsed = parse_draft_pdf(pdf_bytes_list)
        return JSONResponse(content={"status": "success", "data": pdf_parsed})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

@app.post("/api/parse_msg")
async def parse_msg_endpoint(msg_text: str = Form(...)):
    try:
        msg_parsed = parse_rf_msg(msg_text)
        return JSONResponse(content={"status": "success", "data": msg_parsed})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

@app.post("/api/analyze")
async def analyze_endpoint(
    pdf_files: List[UploadFile] = File(...),
    msg_text: str = Form(...)
):
    try:
        pdf_bytes_list =[io.BytesIO(await f.read()) for f in pdf_files]
        pdf_parsed = parse_draft_pdf(pdf_bytes_list)
        msg_parsed = parse_rf_msg(msg_text)
        
        analysis_result = analyze_schedules(pdf_parsed, msg_parsed)
        return JSONResponse(content={"status": "success", "data": analysis_result})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    import threading
    import webbrowser
    import time
    import multiprocessing
    
    # EXE 파일 멀티프로세싱 충돌 방지
    multiprocessing.freeze_support()

    # 🌟 서버가 켜지면 1.5초 뒤에 자동으로 크롬(기본 브라우저)을 여는 기능
    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://127.0.0.1:8000/ui")

    threading.Thread(target=open_browser, daemon=True).start()

    # 서버 실행
    uvicorn.run(app, host="127.0.0.1", port=8000)