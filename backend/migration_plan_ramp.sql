-- 1. Create the new MasterFlight table
CREATE TABLE master_flights (
    id VARCHAR PRIMARY KEY,
    flight_date_z VARCHAR,
    aircraft_reg VARCHAR,
    dep_airport VARCHAR,
    arr_airport VARCHAR,
    flight_number VARCHAR,
    std_z VARCHAR,
    etd_z VARCHAR,
    sta_z VARCHAR,
    out_time_z VARCHAR,
    off_time_z VARCHAR,
    on_time_z VARCHAR,
    in_time_z VARCHAR,
    eta_z VARCHAR,
    dep_gate VARCHAR,
    arr_gate VARCHAR,
    status VARCHAR DEFAULT 'SCHED',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);
CREATE INDEX ix_master_flights_id ON master_flights (id);
CREATE INDEX ix_master_flights_flight_date_z ON master_flights (flight_date_z);
CREATE INDEX ix_master_flights_flight_number ON master_flights (flight_number);
CREATE INDEX ix_master_flights_aircraft_reg ON master_flights (aircraft_reg);
CREATE INDEX ix_master_flights_dep_airport ON master_flights (dep_airport);
CREATE INDEX ix_master_flights_arr_airport ON master_flights (arr_airport);

-- 2. Rename plan_flights to plan_ramp
ALTER TABLE plan_flights RENAME TO plan_ramp;

-- 3. Add master_id column to plan_ramp
ALTER TABLE plan_ramp ADD COLUMN master_id VARCHAR REFERENCES master_flights(id);

-- Optional: Insert existing plan_ramp data into master_flights
INSERT INTO master_flights (
    id, flight_date_z, aircraft_reg, dep_airport, arr_airport, 
    flight_number, std_z, etd_z, sta_z, out_time_z, off_time_z, 
    on_time_z, in_time_z, eta_z, dep_gate, arr_gate, status, is_active
)
SELECT 
    id, flight_date_z, aircraft_reg, dep_airport, arr_airport, 
    flight_number, std_z, etd_z, sta_z, out_time_z, off_time_z, 
    on_time_z, in_time_z, eta_z, dep_gate, arr_gate, status, is_active
FROM plan_ramp
WHERE id IS NOT NULL;