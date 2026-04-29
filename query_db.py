import sqlite3

conn = sqlite3.connect(r"FlightData_App\utils\flight_data.db")
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(raw_flight_data)")
columns = cursor.fetchall()
print("Columns:", [col[1] for col in columns])

cursor.execute("SELECT * FROM raw_flight_data WHERE FLT='321' LIMIT 1")
row = cursor.fetchone()
print("\nSample row:")
for col, val in zip(columns, row):
    print(f"{col[1]:<20}: {val}")

conn.close()
