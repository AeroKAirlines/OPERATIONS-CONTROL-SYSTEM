from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
import sqlite3
import pandas as pd
import os
import json

app = FastAPI(title="Flight Data Analysis Module")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

DB_PATH = os.path.join(BASE_DIR, "utils", "flight_data.db")

import sys
CHECKLIST_DIR = os.path.join(os.path.dirname(BASE_DIR), "Checklist_App")
if CHECKLIST_DIR not in sys.path:
    sys.path.append(CHECKLIST_DIR)
try:
    from config import FLIGHT_DB, TAXI_FUEL_DB
except ImportError:
    FLIGHT_DB = {}
    TAXI_FUEL_DB = {}

def get_db_connection():
    # If DB doesn't exist, we just return None to handle gracefully
    if not os.path.exists(DB_PATH):
        return None
    return sqlite3.connect(DB_PATH)

@app.get("/", response_class=HTMLResponse)
async def dashboard_home(request: Request):
    conn = get_db_connection()
    active_routes = []
    inactive_routes = []
    if conn:
        try:
            routes_df = pd.read_sql("SELECT DISTINCT FLT, ROUTE FROM flt_stats ORDER BY FLT", conn)
            
            for _, row in routes_df.iterrows():
                flt = str(row['FLT'])
                route = str(row['ROUTE']).replace(" ", "")
                route_str = f"{flt} ({route})"
                
                is_active = False
                if flt in FLIGHT_DB:
                    conf_route = FLIGHT_DB[flt].get('route', '').replace(" ", "")
                    if conf_route == route:
                        is_active = True
                
                if is_active:
                    active_routes.append(route_str)
                else:
                    inactive_routes.append(route_str)
        except Exception as e:
            print("Error loading routes:", e)
        finally:
            conn.close()
    
    return templates.TemplateResponse(
        request=request, 
        name="dashboard.html", 
        context={
            "request": request, 
            "active_routes": active_routes, 
            "inactive_routes": inactive_routes
        }
    )

@app.get("/api/dashboard_data/{flt_str}")
async def get_dashboard_data(flt_str: str):
    conn = get_db_connection()
    if not conn:
        return JSONResponse(status_code=404, content={"error": "DB not found. Please run preprocess script."})
    
    try:
        import re
        japan_apts = ['KIX', 'NRT', 'FUK', 'CTS', 'NGO', 'OKA', 'IBR', 'OBO', 'KKJ', 'HIJ', 'HNA', 'UKB', 'HND', 'MMJ']
        china_apts = ['TAO', 'TNA', 'SJW', 'YIH', 'DSN', 'HLD', 'LHW']
        taiwan_apts = ['TPE', 'HUN']
        vietnam_apts = ['DAD', 'CXR']
        
        base_query = "SELECT DATE, FLT, DEP, BLOCK_MIN, BURN, FPBURN, EF_FUEL, EA_FUEL, EW_FUEL, EC_FUEL, TK_FUEL, PBLK_TO_TDWN_MIN EW_MIN, TAXI_OUT_MIN, TAXI_IN_MIN, FLTHR_MIN, ATD, TKOF, TDWN, ATA, EW_HIT, EA_HIT, EC_HIT, RAMP, STDN FROM raw_flight_data"
        base_query_valid = f"{base_query} WHERE STDN > 0 AND BURN < RAMP"
        
        if flt_str in ['JPN_ALL_OUT', 'JPN_ALL_IN', 'CNA_ALL_OUT', 'CNA_ALL_IN', 'TWN_ALL_OUT', 'TWN_ALL_IN', 'VNM_ALL_OUT', 'VNM_ALL_IN']:
            if flt_str == 'JPN_ALL_OUT':
                raw_df = pd.read_sql(f"{base_query_valid} AND ARR IN {tuple(japan_apts)}", conn)
            elif flt_str == 'JPN_ALL_IN':
                raw_df = pd.read_sql(f"{base_query_valid} AND DEP IN {tuple(japan_apts)}", conn)
            elif flt_str == 'CNA_ALL_OUT':
                raw_df = pd.read_sql(f"{base_query_valid} AND ARR IN {tuple(china_apts)}", conn)
            elif flt_str == 'CNA_ALL_IN':
                raw_df = pd.read_sql(f"{base_query_valid} AND DEP IN {tuple(china_apts)}", conn)
            elif flt_str == 'TWN_ALL_OUT':
                raw_df = pd.read_sql(f"{base_query_valid} AND ARR IN {tuple(taiwan_apts)}", conn)
            elif flt_str == 'TWN_ALL_IN':
                raw_df = pd.read_sql(f"{base_query_valid} AND DEP IN {tuple(taiwan_apts)}", conn)
            elif flt_str == 'VNM_ALL_OUT':
                raw_df = pd.read_sql(f"{base_query_valid} AND ARR IN {tuple(vietnam_apts)}", conn)
            elif flt_str == 'VNM_ALL_IN':
                raw_df = pd.read_sql(f"{base_query_valid} AND DEP IN {tuple(vietnam_apts)}", conn)
            
            # Dummy stats_df to pass the empty check
            stats_df = pd.DataFrame([{"FLT": flt_str, "ROUTE": "ALL"}])
            
        else:
            match = re.match(r"^(.*?)\s*\((.*?)\)$", flt_str)
            if match:
                flt = match.group(1).strip()
                route = match.group(2).strip()
                stats_df = pd.read_sql(f"SELECT * FROM flt_stats WHERE FLT='{flt}' AND ROUTE='{route}'", conn)
                raw_df = pd.read_sql(f"{base_query_valid} AND FLT='{flt}' AND ROUTE='{route}'", conn)
            else:
                flt = flt_str # fallback
                stats_df = pd.read_sql(f"SELECT * FROM flt_stats WHERE FLT='{flt}'", conn)
                raw_df = pd.read_sql(f"{base_query_valid} AND FLT='{flt}'", conn)

        if stats_df.empty or raw_df.empty:
            return JSONResponse(status_code=404, content={"error": "Route not found or no data"})
        
        stats = stats_df.iloc[0].to_dict()
        
        # Timeline logic (medians)
        # Parse ATD, TKOF, TDWN, ATA into minutes since midnight to get relative intervals
        from datetime import datetime
        import numpy as np
        from scipy import stats as scipy_stats
        
        def to_minutes(t_str):
            if pd.isna(t_str): return np.nan
            try:
                t = datetime.strptime(t_str, "%H:%M")
                return t.hour * 60 + t.minute
            except:
                return np.nan
                
        def diff_min(start, end):
            if np.isnan(start) or np.isnan(end): return np.nan
            diff = end - start
            return diff if diff >= 0 else diff + 1440
            
        raw_df['ATD_M'] = raw_df['ATD'].apply(to_minutes)
        raw_df['TKOF_M'] = raw_df['TKOF'].apply(to_minutes)
        raw_df['TDWN_M'] = raw_df['TDWN'].apply(to_minutes)
        raw_df['ATA_M'] = raw_df['ATA'].apply(to_minutes)
        
        raw_df['TIMELINE_TAXI_OUT'] = raw_df.apply(lambda x: diff_min(x['ATD_M'], x['TKOF_M']), axis=1)
        raw_df['TIMELINE_FLIGHT'] = raw_df.apply(lambda x: diff_min(x['TKOF_M'], x['TDWN_M']), axis=1)
        raw_df['TIMELINE_TAXI_IN'] = raw_df.apply(lambda x: diff_min(x['TDWN_M'], x['ATA_M']), axis=1)
        
        timeline = {
            "TAXI_OUT": float(raw_df['TIMELINE_TAXI_OUT'].median(skipna=True)),
            "FLIGHT": float(raw_df['TIMELINE_FLIGHT'].median(skipna=True)),
            "TAXI_IN": float(raw_df['TIMELINE_TAXI_IN'].median(skipna=True))
        }

        # Extra Fuel Analysis Logic
        # Surplus burn = 5% of Extra Fuel. Adjusted Excess Burn = (BURN - FPBURN) - (Extra * 0.05)
        raw_df['TOTAL_EXTRA'] = raw_df['EA_FUEL'].fillna(0) + raw_df['EW_FUEL'].fillna(0) + raw_df['EC_FUEL'].fillna(0)
        
        # Calculate actual estimated taxi fuel (12kg per min)
        raw_df['ACTUAL_TAXI'] = (raw_df['TAXI_OUT_MIN'].fillna(0) + raw_df['TAXI_IN_MIN'].fillna(0)) * 12
        
        raw_df['ADJ_EXCESS_BURN'] = (raw_df['BURN'] - raw_df['FPBURN']) - (raw_df['TOTAL_EXTRA'] * 0.05)
        
        # Load rates
        N = len(raw_df)
        load_ea = raw_df['EA_FUEL'] > 0
        load_ew = raw_df['EW_FUEL'] > 0
        load_ec = raw_df['EC_FUEL'] > 0
        load_tk = raw_df['TK_FUEL'] > 0
        
        # Compute T-test for EA (Loaded vs Not Loaded on ADJ_EXCESS_BURN)
        ea_loaded_burn = raw_df[load_ea]['ADJ_EXCESS_BURN'].dropna()
        ea_not_loaded_burn = raw_df[~load_ea]['ADJ_EXCESS_BURN'].dropna()
        if len(ea_loaded_burn) > 1 and len(ea_not_loaded_burn) > 1:
            t_stat, p_val_ea = scipy_stats.ttest_ind(ea_loaded_burn, ea_not_loaded_burn, equal_var=False)
        else:
            p_val_ea = np.nan
            
        ew_loaded_burn = raw_df[load_ew]['ADJ_EXCESS_BURN'].dropna()
        ew_not_loaded_burn = raw_df[~load_ew]['ADJ_EXCESS_BURN'].dropna()
        if len(ew_loaded_burn) > 1 and len(ew_not_loaded_burn) > 1:
            _, p_val_ew = scipy_stats.ttest_ind(ew_loaded_burn, ew_not_loaded_burn, equal_var=False)
        else:
            p_val_ew = np.nan

        ec_loaded_burn = raw_df[load_ec]['ADJ_EXCESS_BURN'].dropna()
        ec_not_loaded_burn = raw_df[~load_ec]['ADJ_EXCESS_BURN'].dropna()

        # Calculate averages for coverage limits (ignoring NaNs and zeroes intelligently if needed, but mean handles it)
        avg_fpburn = float(raw_df['FPBURN'].mean(skipna=True)) if 'FPBURN' in raw_df else 0
        avg_ef = float(raw_df['EF_FUEL'].mean(skipna=True)) if 'EF_FUEL' in raw_df else 0
        
        # Only average the extra fuel for flights that ACTUALLY loaded it!
        avg_ea = float(raw_df[raw_df['EA_FUEL'] > 0]['EA_FUEL'].mean(skipna=True)) if load_ea.any() else 0
        avg_ew = float(raw_df[raw_df['EW_FUEL'] > 0]['EW_FUEL'].mean(skipna=True)) if load_ew.any() else 0
        avg_ec = float(raw_df[raw_df['EC_FUEL'] > 0]['EC_FUEL'].mean(skipna=True)) if load_ec.any() else 0
        avg_tk = float(raw_df[raw_df['TK_FUEL'] > 0]['TK_FUEL'].mean(skipna=True)) if load_tk.any() else 0

        # Convert raw_df to list for plots (Chart.js BoxPlot or Plotly needs arrays)
        # We need aligned arrays for cross-filtering (e.g. BURN where EA > 0)
        plot_df = raw_df[['BURN', 'FPBURN', 'EF_FUEL', 'BLOCK_MIN', 'FLTHR_MIN', 'TAXI_OUT_MIN', 'TAXI_IN_MIN', 'ACTUAL_TAXI', 'EA_FUEL', 'EW_FUEL', 'EC_FUEL', 'TK_FUEL', 'TOTAL_EXTRA']].fillna(0)
        aligned_raw = plot_df.to_dict(orient='list')

        # Coverage calculation: what percent of flights were successfully covered by the loaded bounds?
        # COVERED_BY_PLAN: BURN <= FPBURN
        # COVERED_BY_CCF: BURN <= FPBURN + EF_FUEL
        covered_plan = (raw_df['BURN'] <= raw_df['FPBURN']).mean() * 100 if 'FPBURN' in raw_df and 'BURN' in raw_df else 0
        covered_ccf = (raw_df['BURN'] <= (raw_df['FPBURN'] + raw_df['EF_FUEL'].fillna(0))).mean() * 100 if 'FPBURN' in raw_df and 'BURN' in raw_df else 0

        # Top 5 Outliers Calculation (Fuel Excess)
        if 'DATE' not in raw_df.columns: raw_df['DATE'] = ''
        if 'ATD' not in raw_df.columns: raw_df['ATD'] = ''
        
        raw_df['OVERSHOOT'] = raw_df['BURN'] - raw_df['FPBURN']
        outliers_df = raw_df[raw_df['OVERSHOOT'] > 0].copy()
        outliers_df = outliers_df.sort_values(by='OVERSHOOT', ascending=False).head(5)
        
        outliers_list = []
        for _, row in outliers_df.iterrows():
            total_extra_all = (row['EA_FUEL'] if not pd.isna(row['EA_FUEL']) else 0) + \
                              (row['EW_FUEL'] if not pd.isna(row['EW_FUEL']) else 0) + \
                              (row['EC_FUEL'] if not pd.isna(row['EC_FUEL']) else 0) + \
                              (row['TK_FUEL'] if not pd.isna(row['TK_FUEL']) else 0)
            
            overshoot_ccf = float(row['BURN'] - (row['FPBURN'] + (row['EF_FUEL'] if not pd.isna(row['EF_FUEL']) else 0)))
            net_remaining = float((row['FPBURN'] + (row['EF_FUEL'] if not pd.isna(row['EF_FUEL']) else 0) + total_extra_all) - row['BURN'])
            
            outliers_list.append({
                "FLT": str(row['FLT']) if 'FLT' in row.index else "",
                "DATE": str(row['DATE']),
                "ATD": str(row['ATD']) if not pd.isna(row['ATD']) else "",
                "BURN": float(row['BURN']) if not pd.isna(row['BURN']) else 0,
                "OVERSHOOT": float(row['OVERSHOOT']),
                "OVERSHOOT_CCF": float(overshoot_ccf),
                "DEV_TAXI_OUT": float(row['TIMELINE_TAXI_OUT'] - timeline['TAXI_OUT']) if not pd.isna(row['TIMELINE_TAXI_OUT']) else 0,
                "DEV_FLIGHT": float(row['TIMELINE_FLIGHT'] - timeline['FLIGHT']) if not pd.isna(row['TIMELINE_FLIGHT']) else 0,
                "DEV_TAXI_IN": float(row['TIMELINE_TAXI_IN'] - timeline['TAXI_IN']) if not pd.isna(row['TIMELINE_TAXI_IN']) else 0,
                "EA": float(row['EA_FUEL']) if not pd.isna(row['EA_FUEL']) else 0,
                "EW": float(row['EW_FUEL']) if not pd.isna(row['EW_FUEL']) else 0,
                "EC": float(row['EC_FUEL']) if not pd.isna(row['EC_FUEL']) else 0,
                "TK": float(row['TK_FUEL']) if not pd.isna(row['TK_FUEL']) else 0,
                "RAMP": float(row['RAMP']) if not pd.isna(row['RAMP']) and str(row['RAMP']).strip() != '' else 0,
                "STDN": float(row['STDN']) if not pd.isna(row['STDN']) and str(row['STDN']).strip() != '' else 0,
                "NET_REMAINING": float(net_remaining)
            })

        # Lookup config taxi fuel
        if 'DEP' in raw_df.columns and len(raw_df) > 0:
            dep_airport = raw_df['DEP'].iloc[0]
            config_taxi = float(TAXI_FUEL_DB.get(dep_airport, 200))
        else:
            config_taxi = 200.0

        raw_data = {
            "TOP_OUTLIERS": outliers_list,
            "N": N,
            "TIMELINE": timeline,
            **aligned_raw,
            
            "COVERAGE": {
               "RATE_PLAN": float(covered_plan),
               "RATE_CCF": float(covered_ccf),
               "AVG_FPBURN": avg_fpburn,
               "AVG_EF": avg_ef,
               "AVG_EA": avg_ea,
               "AVG_EW": avg_ew,
               "AVG_EC": avg_ec,
               "AVG_TK": avg_tk,
               "CONFIG_TAXI": config_taxi
            },
            
            "LOAD_RATES": {
               "EA": float(load_ea.mean()) * 100,
               "EW": float(load_ew.mean()) * 100,
               "EC": float(load_ec.mean()) * 100,
               "TK": float(load_tk.mean()) * 100
            }
        }
        
        return {
            "stats": stats,
            "raw": raw_data
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        conn.close()
