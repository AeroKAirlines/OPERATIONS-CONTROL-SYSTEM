chcp 65001 > nul
@echo off
set PYTHONIOENCODING=utf-8

echo ========================================================
echo [ Aero K OCC System (Local Windows Mode) ]
echo ========================================================
echo.
echo 파이썬으로 서버를 실행합니다... (DB 위치: db/occ_core.db)
echo.

python -m backend.main

pause