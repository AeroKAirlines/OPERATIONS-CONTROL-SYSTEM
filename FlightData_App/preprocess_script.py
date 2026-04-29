import pandas as pd
import numpy as np
import os
from datetime import timedelta
import sqlite3

def time_difference_minutes(start_str, end_str):
    if pd.isna(start_str) or pd.isna(end_str):
        return np.nan
    try:
        start = pd.to_datetime(start_str, format='%H:%M').time()
        end = pd.to_datetime(end_str, format='%H:%M').time()
        
        # Convert to minutes since midnight
        s_min = start.hour * 60 + start.minute
        e_min = end.hour * 60 + end.minute
        
        diff = e_min - s_min
        if diff < 0:
            diff += 24 * 60 # Handle crossing midnight
        return diff
    except:
        return np.nan

def process_flight_data(excel_path, db_path):
    print(f"Reading {excel_path}...")
    df = pd.read_excel(excel_path)
    
    # 1. basic date/route string formatting
    print("Preprocessing basic fields...")
    if 'DATE' in df.columns:
        # try to parse date (assuming format like DD/MM/YY or YYYY-MM-DD)
        try:
           # Enforce dayfirst=True to handle cases where 02/09/2025 is parsed as Feb 9th instead of Sept 2nd.
           # Pandas is smart enough to still parse YYYY-MM-DD correctly even with dayfirst=True.
           df['DATE'] = pd.to_datetime(df['DATE'], dayfirst=True).dt.strftime('%Y-%m-%d')
        except:
           pass
    
    df['ROUTE'] = df['DEP'] + "-" + df['ARR']
    
    # 2. Filter out Divert, Extra, Repositioning Flights
    print("Filtering out abnormal flights...")
    # Condition 1: FLT contains 'A' or 'D'
    df['FLT'] = df['FLT'].astype(str)
    mask_ad = df['FLT'].str.contains('A|D', case=False, na=False)
    
    # Condition 2: DEP == ARR (Air turn-back or similar)
    mask_same_dep_arr = df['DEP'] == df['ARR']
    
    # Condition 3: Ferry flights between ICN and CJJ
    mask_icn_cjj = df['ROUTE'].isin(['ICN-CJJ', 'CJJ-ICN'])
    
    # Apply conditions
    df = df[~(mask_ad | mask_same_dep_arr | mask_icn_cjj)].copy()
    print(f"Remaining flights after filtering abnormal routes: {len(df)}")
    
    # Filter out impossible fuel data (Missing or severe manual input errors)
    if 'BURN' in df.columns and 'FPBURN' in df.columns:
        valid_fuel_mask = (
            (df['BURN'] > 0) & 
            (df['FPBURN'] > 0) & 
            (df['BURN'] <= df['FPBURN'] * 1.5) & 
            (df['BURN'] >= df['FPBURN'] * 0.5)
        )
        df = df[valid_fuel_mask].copy()
        print(f"Remaining flights after invalid fuel filtering: {len(df)}")
    
    # 3. EW Logic Calculation: Time difference from PBLK to TDWN
    # This is to see if actual flight time including taxi was long due to weather
    print("Calculating EW/EA/EC Hit Metrics...")
    df['PBLK_TO_TDWN_MIN'] = df.apply(lambda row: time_difference_minutes(row.get('PBLK'), row.get('TDWN')), axis=1)
    
    # We will compute flight number averages
    route_medians = df.groupby('FLT')[['PBLK_TO_TDWN_MIN', 'BLOCK_MIN', 'BURN']].median().reset_index()
    route_medians.columns = ['FLT', 'FLT_MEDIAN_PBLK_TDWN', 'FLT_MEDIAN_BLOCK', 'FLT_MEDIAN_BURN']
    
    df = df.merge(route_medians, on='FLT', how='left')
    
    # Calculate HIT metrics
    # EW: Did PBLK to TDWN take longer than FLT median?
    df['EW_HIT'] = (df['PBLK_TO_TDWN_MIN'] > df['FLT_MEDIAN_PBLK_TDWN']).astype(int)
    
    # EA: Did block time get longer than median?
    df['EA_HIT'] = (df['BLOCK_MIN'] > df['FLT_MEDIAN_BLOCK']).astype(int)
    
    # EC: Did actual burn exceed planned flight plan burn? Or exceed FLT median?
    # Let's use FPBURN (Flight plan burn) as baseline if available
    df['EC_HIT'] = (df['BURN'] > df['FPBURN']).astype(int) 

    # Clean up column names for sqlite (replace hyphens and spaces)
    df.columns = [c.replace(' ', '_').replace('-', '_') for c in df.columns]

    print("Saving to DB...")
    # write to DB
    conn = sqlite3.connect(db_path)
    df.to_sql('raw_flight_data', conn, if_exists='replace', index=False)
    
    # Also create flight aggregated stats for fast dashboard querying
    # Calculate q1, median, q3, mean for key metrics per flight number
    stats = df.groupby(['FLT', 'ROUTE']).agg({
        'BLOCK_MIN': ['count', 'mean', 'median', lambda x: x.quantile(0.25), lambda x: x.quantile(0.75), 'max'],
        'BURN': ['mean', 'median', lambda x: x.quantile(0.25), lambda x: x.quantile(0.75)],
        'TAXI_OUT_MIN': ['mean'],
        'TAXI_IN_MIN': ['mean'],
        'EW_HIT': ['mean'],
        'EA_HIT': ['mean'],
        'EC_HIT': ['mean'],
        'EW_FUEL': ['mean'],
        'EA_FUEL': ['mean'],
        'EC_FUEL': ['mean'],
        'TK_FUEL': ['mean']
    }).reset_index()
    
    # flattened columns
    stats.columns = [
        'FLT', 'ROUTE', 'FLIGHT_COUNT', 'BLOCK_MEAN', 'BLOCK_MEDIAN', 'BLOCK_Q1', 'BLOCK_Q3', 'BLOCK_MAX',
        'BURN_MEAN', 'BURN_MEDIAN', 'BURN_Q1', 'BURN_Q3',
        'TAXI_OUT_MEAN', 'TAXI_IN_MEAN',
        'EW_HIT_RATE', 'EA_HIT_RATE', 'EC_HIT_RATE',
        'AVG_EW_FUEL', 'AVG_EA_FUEL', 'AVG_EC_FUEL', 'AVG_TK_FUEL'
    ]
    
    stats.to_sql('flt_stats', conn, if_exists='replace', index=False)
    conn.close()
    print(f"Done! DB saved at {db_path}")

if __name__ == "__main__":
    # Example usage:
    # python preprocess_script.py "input_data.xlsx"
    import sys
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    else:
        # Default fallback
        excel_file = "sample.xlsx"
        
    db_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "utils", "flight_data.db")
    process_flight_data(excel_file, db_file)
