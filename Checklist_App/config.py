# config.py

# 노선별 기초 데이터 및 특이사항 (S26 FIXED 및 TENT 스케줄 기반 전체 통합 DB)
FLIGHT_DB = {
    # 가. 국내선 (청주 - 제주)
    "601": {"pair": "602", "route": "CJJ - CJU", "std_z": "2320", "sta_z": "0040", "type": "out", "remarks": "MULTI"},
    "602": {"pair": "601", "route": "CJU - CJJ", "std_z": "0135", "sta_z": "0245", "type": "in",  "remarks": "MULTI"},
    "609": {"pair": "610", "route": "CJJ - CJU", "std_z": "0550", "sta_z": "0700", "type": "out", "remarks": "MULTI"},
    "610": {"pair": "609", "route": "CJU - CJJ", "std_z": "0740", "sta_z": "0850", "type": "in",  "remarks": "MULTI"},
    "613": {"pair": "614", "route": "CJJ - CJU", "std_z": "0935", "sta_z": "1050", "type": "out", "remarks": "MULTI"},
    "614": {"pair": "613", "route": "CJU - CJJ", "std_z": "1225", "sta_z": "1335", "type": "in",  "remarks": "MULTI"},

    # 나. 국제선 (청주 출발)
    "312": {"pair": "311", "route": "CJJ - KIX", "std_z": "2315", "sta_z": "0055", "type": "out", "remarks": ""},
    "311": {"pair": "312", "route": "KIX - CJJ", "std_z": "0155", "sta_z": "0330", "type": "in",  "remarks": ""},
    "318": {"pair": "317", "route": "CJJ - KIX", "std_z": "0650", "sta_z": "0835", "type": "out", "remarks": ""},
    "317": {"pair": "318", "route": "KIX - CJJ", "std_z": "1000", "sta_z": "1145", "type": "in",  "remarks": ""},
    "306": {"pair": "305", "route": "CJJ - KIX", "std_z": "0900", "sta_z": "1040", "type": "out", "remarks": ""},
    "305": {"pair": "306", "route": "KIX - CJJ", "std_z": "1140", "sta_z": "1340", "type": "in",  "remarks": ""},
    "392": {"pair": "391", "route": "CJJ - NRT", "std_z": "2220", "sta_z": "0040", "type": "out", "remarks": ""},
    "391": {"pair": "392", "route": "NRT - CJJ", "std_z": "0140", "sta_z": "0405", "type": "in",  "remarks": ""},
    "322": {"pair": "321", "route": "CJJ - NRT", "std_z": "0030", "sta_z": "0250", "type": "out", "remarks": ""},
    "321": {"pair": "322", "route": "NRT - CJJ", "std_z": "0405", "sta_z": "0630", "type": "in",  "remarks": ""},
    "324": {"pair": "323", "route": "CJJ - NRT", "std_z": "0715", "sta_z": "0945", "type": "out", "remarks": "조발금지"},
    "323": {"pair": "324", "route": "NRT - CJJ", "std_z": "1035", "sta_z": "1255", "type": "in",  "remarks": ""},
    "332": {"pair": "331", "route": "CJJ - FUK", "std_z": "2135", "sta_z": "2245", "type": "out", "remarks": ""},
    "331": {"pair": "332", "route": "FUK - CJJ", "std_z": "2330", "sta_z": "0100", "type": "in",  "remarks": ""},
    "336": {"pair": "335", "route": "CJJ - FUK", "std_z": "0700", "sta_z": "0830", "type": "out", "remarks": ""},
    "335": {"pair": "336", "route": "FUK - CJJ", "std_z": "0930", "sta_z": "1045", "type": "in",  "remarks": ""},
    "352": {"pair": "351", "route": "CJJ - CTS", "std_z": "2325", "sta_z": "0155", "type": "out", "remarks": ""},
    "351": {"pair": "352", "route": "CTS - CJJ", "std_z": "0255", "sta_z": "0545", "type": "in",  "remarks": ""},
    "356": {"pair": "355", "route": "CJJ - CTS", "std_z": "0420", "sta_z": "0650", "type": "out", "remarks": ""},
    "355": {"pair": "356", "route": "CTS - CJJ", "std_z": "0750", "sta_z": "1045", "type": "in",  "remarks": ""},
    "342": {"pair": "341", "route": "CJJ - NGO", "std_z": "0840", "sta_z": "1030", "type": "out", "remarks": ""},
    "341": {"pair": "342", "route": "NGO - CJJ", "std_z": "1130", "sta_z": "1315", "type": "in",  "remarks": ""},
    "394": {"pair": "393", "route": "CJJ - OKA", "std_z": "2155", "sta_z": "0005", "type": "out", "remarks": ""},
    "393": {"pair": "394", "route": "OKA - CJJ", "std_z": "0050", "sta_z": "0300", "type": "in",  "remarks": ""},
    "396": {"pair": "395", "route": "CJJ - OKA", "std_z": "0900", "sta_z": "1100", "type": "out", "remarks": ""},
    "395": {"pair": "396", "route": "OKA - CJJ", "std_z": "1200", "sta_z": "1410", "type": "in",  "remarks": ""},
    "384": {"pair": "383", "route": "CJJ - IBR", "std_z": "0500", "sta_z": "0705", "type": "out", "remarks": ""},
    "383": {"pair": "384", "route": "IBR - CJJ", "std_z": "0815", "sta_z": "1035", "type": "in",  "remarks": ""},
    "354": {"pair": "353", "route": "CJJ - OBO", "std_z": "0500", "sta_z": "0730", "type": "out", "remarks": ""},
    "353": {"pair": "354", "route": "OBO - CJJ", "std_z": "0905", "sta_z": "1205", "type": "in",  "remarks": ""},
    "372": {"pair": "371", "route": "CJJ - KKJ", "std_z": "0430", "sta_z": "0540", "type": "out", "remarks": "MULTI"},
    "371": {"pair": "372", "route": "KKJ - CJJ", "std_z": "0645", "sta_z": "0800", "type": "in",  "remarks": "MULTI"},
    "374": {"pair": "373", "route": "CJJ - KKJ", "std_z": "2310", "sta_z": "0015", "type": "out", "remarks": "MULTI"},
    "373": {"pair": "374", "route": "KKJ - CJJ", "std_z": "0255", "sta_z": "0410", "type": "in",  "remarks": "MULTI"},
    "386": {"pair": "385", "route": "CJJ - HIJ", "std_z": "0430", "sta_z": "0550", "type": "out", "remarks": "MULTI"},
    "385": {"pair": "386", "route": "HIJ - CJJ", "std_z": "0655", "sta_z": "0815", "type": "in",  "remarks": "MULTI"},
    "3883": {"pair": "3873", "route": "CJJ - HNA", "std_z": "0325", "sta_z": "0535", "type": "out", "remarks": "IN"},
    "3873": {"pair": "3883", "route": "HNA - CJJ", "std_z": "0635", "sta_z": "0905", "type": "in",  "remarks": "IN"},
    "3203": {"pair": "3193", "route": "CJJ - UKB", "std_z": "0305", "sta_z": "0430", "type": "out", "remarks": "IN"},
    "3193": {"pair": "3203", "route": "UKB - CJJ", "std_z": "0530", "sta_z": "0645", "type": "in",  "remarks": "IN"},
    "3063": {"pair": "3053", "route": "CJJ - HND", "std_z": "1420", "sta_z": "1650", "type": "out", "remarks": "IN"},
    "3053": {"pair": "3063", "route": "HND - CJJ", "std_z": "1850", "sta_z": "2120", "type": "in",  "remarks": "IN"},
    "3963": {"pair": "3953", "route": "CJJ - MMJ", "std_z": "0245", "sta_z": "0440", "type": "out", "remarks": "IN"},
    "3953": {"pair": "3963", "route": "MMJ - CJJ", "std_z": "0540", "sta_z": "0730", "type": "in",  "remarks": "IN"},
    "511": {"pair": "512", "route": "CJJ - TPE", "std_z": "0130", "sta_z": "0420", "type": "out", "remarks": ""},
    "512": {"pair": "511", "route": "TPE - CJJ", "std_z": "0515", "sta_z": "0740", "type": "in",  "remarks": ""},
    "421": {"pair": "422", "route": "CJJ - UBN", "std_z": "1235", "sta_z": "1605", "type": "out", "remarks": "WX Attach", "pax_remark": "-4"},
    "422": {"pair": "421", "route": "UBN - CJJ", "std_z": "1805", "sta_z": "2110", "type": "in",  "remarks": "", "pax_remark": "-4"},
    "8133": {"pair": "8143", "route": "CJJ - SJW", "std_z": "0350", "sta_z": "0745", "type": "out", "remarks": "IN"},
    "8143": {"pair": "8133", "route": "SJW - CJJ", "std_z": "0845", "sta_z": "1035", "type": "in",  "remarks": "IN"},
    "8153": {"pair": "8163", "route": "CJJ - YIH", "std_z": "0500", "sta_z": "0800", "type": "out", "remarks": ""},
    "8163": {"pair": "8153", "route": "YIH - CJJ", "std_z": "0900", "sta_z": "1205", "type": "in",  "remarks": ""},
    "8933": {"pair": "8943", "route": "CJJ - DSN", "std_z": "1415", "sta_z": "1710", "type": "out", "remarks": ""},
    "8943": {"pair": "8933", "route": "DSN - CJJ", "std_z": "1840", "sta_z": "2115", "type": "in",  "remarks": ""},
    "8953": {"pair": "8963", "route": "CJJ - HLD", "std_z": "1415", "sta_z": "1715", "type": "out", "remarks": ""},
    "8963": {"pair": "8953", "route": "HLD - CJJ", "std_z": "1830", "sta_z": "2120", "type": "in",  "remarks": ""},
    "8973": {"pair": "8983", "route": "CJJ - LHW", "std_z": "1330", "sta_z": "1715", "type": "out", "remarks": ""},
    "8983": {"pair": "8973", "route": "LHW - CJJ", "std_z": "1815", "sta_z": "2135", "type": "in",  "remarks": ""},
    "521": {"pair": "522", "route": "CJJ - CRK", "std_z": "1350", "sta_z": "1725", "type": "out", "remarks": "COB, DLY6, RPLL화/일, 조발必", "pax_remark": "-4"},
    "522": {"pair": "521", "route": "CRK - CJJ", "std_z": "1825", "sta_z": "2225", "type": "in",  "remarks": "COB, RWY CLSD", "pax_remark": "-4"},
    "531": {"pair": "532", "route": "CJJ - DAD", "std_z": "1155", "sta_z": "1655", "type": "out", "remarks": "급유량, CTOT"},
    "532": {"pair": "531", "route": "DAD - CJJ", "std_z": "1755", "sta_z": "2210", "type": "in",  "remarks": "급유량, RWY35 RTOW"},
    "557": {"pair": "558", "route": "CJJ - CXR", "std_z": "1030", "sta_z": "1530", "type": "out", "remarks": "급유량, S1D2,DLY6"},
    "558": {"pair": "557", "route": "CXR - CJJ", "std_z": "1630", "sta_z": "2120", "type": "in",  "remarks": "급유량, S1D2"},

    # 다. 국제선 (인천 출발)
    "316": {"pair": "315", "route": "ICN - KIX", "std_z": "2120", "sta_z": "2305", "type": "out", "remarks": "CDR 2"},
    "315": {"pair": "316", "route": "KIX - ICN", "std_z": "2355", "sta_z": "0205", "type": "in",  "remarks": ""},
    "314": {"pair": "313", "route": "ICN - KIX", "std_z": "1035", "sta_z": "1215", "type": "out", "remarks": "CDR 2, 야간편 검토"},
    "313": {"pair": "314", "route": "KIX - ICN", "std_z": "1300", "sta_z": "1505", "type": "in",  "remarks": ""},
    "388": {"pair": "387", "route": "ICN - IBR", "std_z": "0250", "sta_z": "0500", "type": "out", "remarks": "CDR 2"},
    "387": {"pair": "388", "route": "IBR - ICN", "std_z": "0605", "sta_z": "0840", "type": "in",  "remarks": ""},
    "881": {"pair": "882", "route": "ICN - TNA", "std_z": "0315", "sta_z": "0505", "type": "out", "remarks": ""},
    "882": {"pair": "881", "route": "TNA - ICN", "std_z": "0655", "sta_z": "0840", "type": "in",  "remarks": ""},
    "5193": {"pair": "5203", "route": "ICN - HUN", "std_z": "0250", "sta_z": "0520", "type": "out", "remarks": "IN"},
    "5203": {"pair": "5193", "route": "HUN - ICN", "std_z": "0650", "sta_z": "0920", "type": "in",  "remarks": "IN"},
}

# 설정되지 않은 노선을 위한 기본값 (오류 방지용)
DEFAULT_FLIGHT = {"pair": "", "route": "", "std_z": "0000", "sta_z": "0000", "type": "out", "remarks": ""}

# ==========================================
# 🌟 추가된 데이터베이스 (DOW & TANKERING & CAPTAIN)
# ==========================================

# 주의가 필요한 특정 기장 명단 (CAT 2/3 미취득 등) - 영문 대문자로 기재
TARGET_CPTS = [
    "CHOI SEUNG WON",
    "KIM YOUNG MIN",
    "SEO YONG JANG",
    "KIM TAE HYUN"
]

# DOW(Dry Operating Weight) DB (WEF 2026-05-01 기준 업데이트)
DOW_DB = {
    "HL8385": {"D": "42,583", "CIa": "42,686", "CIb": "42,756", "IIa": "42,653"},
    "HL8386": {"D": "42,458", "CIa": "42,560", "CIb": "42,631", "IIa": "42,527"},
    "HL8540": {"D": "43,425", "CIa": "43,528", "CIb": "43,598", "IIa": "43,495"},
    "HL8562": {"D": "42,922", "CIa": "43,024", "CIb": "43,095", "IIa": "42,991"},
    "HL8563": {"D": "43,395", "CIa": "43,497", "CIb": "43,568", "IIa": "43,464"},
    "HL8595": {"D": "43,157", "CIa": "43,259", "CIb": "43,330", "IIa": "43,226"},
    "HL8596": {"D": "43,261", "CIa": "43,364", "CIb": "43,434", "IIa": "43,331"},
    "HL8743": {"D": "42,665", "CIa": "42,767", "CIb": "42,838", "IIa": "42,734"},
    "HL8744": {"D": "42,784", "CIa": "42,886", "CIb": "42,957", "IIa": "42,853"},
}

# TANKERING DB (목적지 기준)
TANKERING_DB = {
    "1000KG":["KIX", "CTS", "HIJ", "KKJ", "TAO", "CEB", "TNA", "CRK", "SJW", "YIH", "UBN"],
    "1500KG": ["OKA"],
    "1600KG": ["IBR", "OBO"],
    "FULL": ["FUK"]
}

# Pantry Code 분류용 (CIb 기준 국가 코드 모음)
PANTRY_CIB_DEST =["CRK", "DAD", "UBN", "CEB", "CXR"]

# 🌟 TAXI FUEL DB (출발지 공항 기준)
TAXI_FUEL_DB = {
    "CJJ": "300", "ICN": "300", "CJU": "200", "OKA": "300", "FUK": "200", 
    "KKJ": "200", "HIJ": "200", "KIX": "400", "NGO": "300", "NRT": "500", 
    "IBR": "200", "CTS": "300", "OBO": "200", "TPE": "400", "HUN": "200", 
    "CXR": "300", "DAD": "300", "CRK": "300", "CEB": "300", "TAO": "400",
    "TNA": "300", "SJW": "300" 
}

# 🌟 RUNWAY DB (출발지 공항 기준 활주로 정보)
RWY_DB = {
    "CJJ":["24R", "06L"], "ICN":["15R", "33L"], "CTS":["01L", "19R"],
    "KIX":["06L", "24R"], "TPE":["05R", "23L"], "NRT": ["16R", "34L"],
    "IBR":["03L", "21R"], "OBO":["17", "35"], "KKJ": ["18", "36"],
    "HIJ":["10", "28"], "NGO": ["18", "36"], "CXR":["02L", "20R"],
    "CEB": ["04R", "22L"], "CRK":["02", "20"], "DAD":["17L", "35R"],
    "OKA":["18L", "36R"], "FUK": ["16R", "34L"], "CJU":["07", "25"],
    "TNA": ["01", "19"], "SJW":["15", "33"], "UBN": ["11", "29"],
    "HUN":["03", "21"], "YIH":["14", "32"],
    
    # 데이터 상 활주로 정보가 공란인 공항들
    "TAO": ["", ""]
}

# ==========================================
# 🌟 날씨 조회용 공항 위경도 (부정기/전 노선 포함)
# ==========================================
AIRPORT_COORDS = {
    "CJJ": (36.716, 127.499), "ICN": (37.460, 126.440), "CJU": (33.511, 126.493),
    "KIX": (34.427, 135.244), "NRT": (35.764, 140.386), "FUK": (33.585, 130.450),
    "CTS": (42.775, 141.692), "NGO": (34.858, 136.805), "OKA": (26.195, 127.645),
    "IBR": (36.182, 140.413), "OBO": (42.873, 143.217), "KKJ": (33.845, 130.965),
    "HIJ": (34.436, 132.919), "TPE": (25.077, 121.232), "UBN": (47.652, 106.818),
    "DAD": (16.043, 108.199), "CXR": (11.998, 109.219), "CRK": (15.185, 120.559),
    "CEB": (10.307, 123.979), "HUN": (24.023, 121.618), "TAO": (36.266, 120.012),
    "TNA": (36.857, 117.215), "SJW": (38.280, 114.697), "YIH": (30.558, 111.478),
    "DSN": (39.490, 109.860), "HLD": (49.205, 119.824), "LHW": (36.515, 103.621),
    "HNA": (39.428, 141.136), "UKB": (34.632, 135.223), "HND": (35.549, 139.779),
    "MMJ": (36.166, 137.922)
}