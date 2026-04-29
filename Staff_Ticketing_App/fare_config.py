DOMESTIC_AIRPORTS = ["CJJ", "CJU", "GMP", "PUS", "TAE", "KWJ", "RSU", "USN", "KPO", "HIN", "YNY", "MWX", "WJU"]
JAPAN_CHINA_AIRPORTS = ["CTS", "OBO", "HNA", "NHA", "IBR", "NRT", "NGO", "MMJ", "KIX", "UKB", "HIJ", "FUK", "KKJ", "OKA", "TNA", "SJW", "YIH"]
TAIWAN_MONGOLIA_SEA_AIRPORTS = ["TPE", "HUN", "UBN", "CRK", "DAD", "CXR"]

TAX_RATES = {
    # Domestic
    "DOMESTIC_CJJ": 4000,
    "DOMESTIC_CJU": 4000,
    
    # International
    "INTL_ICN": 24000,
    "INTL_CJJ": 19000,
    "INTL_CTS": 33500,
    "INTL_OBO": 9400,
    "INTL_HNA": 9400,
    "INTL_NHA": 9400,
    "INTL_NRT": 32700,
    "INTL_IBR": 14400,
    "INTL_NGO": 39400,
    "INTL_MMJ": 9400,
    "INTL_KIX": 43300,
    "INTL_UKB": 36000,
    "INTL_HIJ": 13200,
    "INTL_FUK": 33000,
    "INTL_KKJ": 14600,
    "INTL_OKA": 21000,
    "INTL_TPE": 23200,
    "INTL_HUN": 23200,
    "INTL_UBN": 44000,
    "INTL_CRK": 32300,
    "INTL_DAD": 32300,
    "INTL_CXR": 32300,
}

def get_leg_fare(origin: str, dest: str, ticket_class: str) -> int:
    tc = ticket_class.upper()
    if tc in ["BIZ", "DUTY"]:
        return 0
        
    is_domestic = (origin in DOMESTIC_AIRPORTS) and (dest in DOMESTIC_AIRPORTS)
    
    if is_domestic:
        return 10700
        
    is_jp_cn = (origin in JAPAN_CHINA_AIRPORTS) or (dest in JAPAN_CHINA_AIRPORTS)
    is_tw_mn_sea = (origin in TAIWAN_MONGOLIA_SEA_AIRPORTS) or (dest in TAIWAN_MONGOLIA_SEA_AIRPORTS)
    
    if is_jp_cn:
        return 10000 if tc == "SUBLO" else 20000
    elif is_tw_mn_sea:
        return 20000 if tc == "SUBLO" else 40000
    else:
        return 10700 # Default

def get_leg_tax(origin: str, dest: str) -> int:
    is_domestic = (origin in DOMESTIC_AIRPORTS) and (dest in DOMESTIC_AIRPORTS)
    if is_domestic:
        key = f"DOMESTIC_{origin}"
    else:
        key = f"INTL_{origin}"
        
    return TAX_RATES.get(key, -1) # -1 means no tax info

def calculate_total_price(legs, ticket_class: str, pax_count: int):
    total_fare = 0
    total_tax = 0
    has_unknown_tax = False
    
    for origin, dest in legs:
        fare = get_leg_fare(origin, dest, ticket_class)
        tax = get_leg_tax(origin, dest)
        
        total_fare += fare
        if tax == -1:
            has_unknown_tax = True
        else:
            total_tax += tax
            
    total_fare *= pax_count
    total_tax *= pax_count
    
    return {
        "fare": total_fare,
        "tax": total_tax,
        "has_unknown_tax": has_unknown_tax,
        "total": total_fare + total_tax
    }
