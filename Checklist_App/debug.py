import requests

# 청주(CJJ) 좌표 및 우리가 쓰던 파라미터 그대로 세팅
lat, lon = 36.716, 127.499
url = (
    f"https://api.open-meteo.com/v1/forecast?"
    f"latitude={lat}&longitude={lon}"
    f"&hourly=temperature_2m,pressure_msl,winddirection_10m,precipitation,snowfall"
    f"&models=ecmwf_ifs04"
    f"&timezone=UTC"
)

print("🔍 [1] API 요청 URL:")
print(url)
print("-" * 50)

try:
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    res = requests.get(url, headers=headers)
    
    print(f"📡 [2] HTTP 상태 코드: {res.status_code}")
    print("📦 [3] API 실제 응답 데이터 (에러 원인):")
    print(res.text) # 데이터 전체 출력
    
except Exception as e:
    print("❌ [통신 자체 실패]:", str(e))