import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    AIRCRAFT_REGS =['HL8385', 'HL8386', 'HL8540', 'HL8562', 'HL8563', 'HL8595', 'HL8596', 'HL8743', 'HL8744']
    
    # OFP Email settings
    OFP_EMAIL = os.getenv("OFP_EMAIL", "mingi.kim@aerok.com")
    OFP_APP_PASSWORD = os.getenv("OFP_APP_PASSWORD", "")

settings = Settings()