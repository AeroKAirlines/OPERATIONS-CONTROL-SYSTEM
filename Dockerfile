# 파이썬 3.10 버전 사용
FROM python:3.10-slim

# 작업 폴더 지정
WORKDIR /app

# 필요 라이브러리 목록 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 코드 전체 복사
COPY . .

# 포트 오픈
EXPOSE 8000

# 서버 실행 (portal_main.py 안의 portal_app을 실행)
CMD ["uvicorn", "backend.main:portal_app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
