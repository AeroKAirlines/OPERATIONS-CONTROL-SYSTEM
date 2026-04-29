import os
import sys
from flask import Flask, render_template, request, jsonify
from Checklist_App.analyzer import parse_aar_text, calculate_checklist

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/parse_aar', methods=['POST'])
def parse_aar():
    data = request.json
    aar_text = data.get('aar_text', '')
    if not aar_text:
        return jsonify({"status": "error", "message": "AAR 텍스트가 없습니다."})
    
    try:
        raw_flights = parse_aar_text(aar_text)
        return jsonify({"status": "success", "data": raw_flights})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

@app.route('/api/calculate_checklist', methods=['POST'])
def get_calculated_checklist():
    req_data = request.json
    raw_list = req_data.get('raw_data', [])
    mel_text = req_data.get('mel_text', '')
    weather_data = req_data.get('weather_data', {}) 

    try:
        final_flights = calculate_checklist(raw_list, mel_text=mel_text, weather_data=weather_data)
        return jsonify({"status": "success", "data": final_flights})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8000))
    # 0.0.0.0으로 설정해야 외부(인터넷)에서 접속 가능
    app.run(host='0.0.0.0', port=port, debug=False)