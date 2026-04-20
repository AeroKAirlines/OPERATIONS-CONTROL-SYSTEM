// dashboard_schedule.js
// 운항현황판 (Flight Schedule Board) 처리 로직

function formatTime(dateStr, timeStr) {
    if (timeStr === undefined) timeStr = dateStr;
    if (!timeStr) return "-";
    let cleanTime = timeStr.replace(/z/ig, '').replace(/:/g, '');
    if (cleanTime.length === 4) {
        let hr = parseInt(cleanTime.slice(0, 2), 10);
        let mn = cleanTime.slice(2, 4);
        if (typeof displayTimezone !== 'undefined' && displayTimezone === 'KST') {
            hr = (hr + 9) % 24;
        }
        return String(hr).padStart(2, '0') + ":" + mn;
    }
    return cleanTime;
}

function getFlightDate(flight, timeStr) {
    if (!timeStr) return null;
    let now = new Date();
    let y, m, d, hr, mn;

    if (timeStr.includes('/')) {
        let parts = timeStr.split('/');
        hr = parseInt(parts[0].substring(0,2)) || 0;
        mn = parseInt(parts[0].substring(2,4)) || 0;
        d = parseInt(parts[1]) || now.getUTCDate();
        m = now.getUTCMonth();
        y = now.getUTCFullYear();
        if (now.getUTCDate() < 5 && d > 25) m -= 1;
        else if (now.getUTCDate() > 25 && d < 5) m += 1;
    } else {
        let cleanTime = timeStr.replace(/z/ig, '').replace(/:/g, '');
        if (cleanTime.length < 4) return null;
        hr = parseInt(cleanTime.slice(0, 2), 10);
        mn = parseInt(cleanTime.slice(2, 4), 10);
        
        if (!flight || !flight.flight_date_z) return null;
        let parts = flight.flight_date_z.split('-');
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10) - 1;
        d = parseInt(parts[2], 10);

        let stdStr = flight.std_z || "";
        let stdHr = stdStr.length >= 2 ? parseInt(stdStr.replace(/z/ig,'').slice(0,2), 10) : 0;
        if (stdHr > 18 && hr < 6) d += 1; 
    }
    return new Date(Date.UTC(y, m, d, hr, mn));
}

function formatTimeHtml(flight, timeStr, color, fontWeight) {
    if (!timeStr) return "-";
    let dateObj = getFlightDate(flight, timeStr);
    if (!dateObj) return "-";

    let isKst = (typeof displayTimezone !== 'undefined' && displayTimezone === 'KST');
    
    let targetTime = dateObj.getTime();
    if (isKst) targetTime += 9 * 60 * 60 * 1000;
    let targetDate = new Date(targetTime);
    
    let hr = String(targetDate.getUTCHours()).padStart(2, '0');
    let mn = String(targetDate.getUTCMinutes()).padStart(2, '0');
    let timeFormatted = `${hr}:${mn}`;
    
    let styleStr = "";
    if (color) styleStr += `color:${color};`;
    if (fontWeight) styleStr += `font-weight:${fontWeight};`;
    
    let html = `<span${styleStr ? ` style="${styleStr}"` : ''}>${timeFormatted}</span>`;
    return html;
}

function formatDateCol(flight, timeStr) {
    if (!timeStr) return "-";
    let dateObj = getFlightDate(flight, timeStr);
    if (!dateObj) return "-";

    let isKst = (typeof displayTimezone !== 'undefined' && displayTimezone === 'KST');
    
    let targetTime = dateObj.getTime();
    if (isKst) targetTime += 9 * 60 * 60 * 1000;
    let targetDate = new Date(targetTime);
    
    let dateText = `${String(targetDate.getUTCMonth()+1).padStart(2, '0')}/${String(targetDate.getUTCDate()).padStart(2, '0')}`;
    let color = "#8b9bb4"; // 회색 유지
    
    let html = `<div style="display:flex; flex-direction:column; align-items:flex-start; line-height: 1.2;">`;
    html += `<span style="color:${color}; font-weight:600; font-size:13px;">${dateText}</span>`;
    html += `</div>`;
    return html;
}

function renderDashboard(flights) {
    const tbody = document.getElementById('schedule-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const NOW = new Date();

    const activeTableFlights = flights.filter(f => {
        let stdDate = getFlightDate(f, f.std_z || "");
        if (!stdDate) return false;
        
        if (window.isExploreMode) {
            // 🌟 탐색 모드: STD 기준 -24시간 ~ +6시간 (자유롭게 무제한 스크롤 탐색)
            let hoursDiff = (stdDate.getTime() - NOW.getTime()) / (1000 * 60 * 60);
            if (hoursDiff < -24 || hoursDiff > 6) return false; 
            return true;
        } else {
            // 🌟 대시보드 모드: 도착 후 2시간 숨김, 계획 6시간 후 숨김
            const status = f.status || 'SCHED';
            let ofp = Array.isArray(f.ofp_data) ? f.ofp_data[f.ofp_data.length-1] : f.ofp_data;
            let refTimeStr = (status === 'ARRIVED') ? (f.in_time_z || f.on_time_z || f.sta_z) : (f.eta_z || (ofp && ofp.eta) || f.sta_z);
            let refDate = getFlightDate(f, refTimeStr);
            
            if (!['DEPARTED', 'AIRBORNE', 'LANDED'].includes(status)) {
                if (refDate && (NOW.getTime() - refDate.getTime()) / 60000 > 120) return false; 
            }
            
            let hoursUntilStd = (stdDate.getTime() - NOW.getTime()) / (1000 * 60 * 60);
            if (hoursUntilStd > 6) return false; 
            
            return true;
        }
    });

    // Date 객체 기반 정렬 (과거 -> 미래)
    activeTableFlights.sort((a, b) => {
        let aDate = getFlightDate(a, a.std_z || "");
        let bDate = getFlightDate(b, b.std_z || "");
        
        if (!aDate) aDate = new Date(a.flight_date_z + "T23:59:59Z");
        if (!bDate) bDate = new Date(b.flight_date_z + "T23:59:59Z");

        return aDate.getTime() - bDate.getTime();
    });

    activeTableFlights.forEach(f => {
        const tr = document.createElement('tr');
        let dateColHtml = f.std_z ? formatDateCol(f, f.std_z) : (f.flight_date_z || "-");
        let stdHtml = f.std_z ? formatTimeHtml(f, f.std_z) : "-";
        
        let ofp = Array.isArray(f.ofp_data) ? f.ofp_data[f.ofp_data.length-1] : f.ofp_data;
        let etdTimeStr = (ofp && ofp.etd) ? ofp.etd : f.etd_z;
        let etdHtml = etdTimeStr ? formatTimeHtml(f, etdTimeStr) : "-";
        
        let atdHtml = "-";
        if (f.out_time_z) {
            let atdColor = '#60a5fa';
            
            let compareTimeStr = etdTimeStr || f.std_z;
            if (compareTimeStr) {
                let compareDate = getFlightDate(f, compareTimeStr);
                let atdDate = getFlightDate(f, f.out_time_z);
                if (compareDate && atdDate) {
                    let delayMins = (atdDate.getTime() - compareDate.getTime()) / 60000;
                    if (delayMins >= 15) {
                        atdColor = '#ff4d4f'; // 15분 이상 지연 시 붉은색
                    }
                }
            }
            atdHtml = formatTimeHtml(f, f.out_time_z, atdColor, 'bold');
        }

        let staHtml = f.sta_z ? formatTimeHtml(f, f.sta_z) : "-";
        
        let etaHtml = (ofp && ofp.eta) ? formatTimeHtml(f, ofp.eta, 'var(--ak-yellow)') : 
                      (f.eta_z ? formatTimeHtml(f, f.eta_z, 'var(--ak-yellow)') : "-");
        
        let ataHtml = f.in_time_z ? formatTimeHtml(f, f.in_time_z, '#60a5fa', 'bold') : "-";
        let status = f.status || "SCHED";
        let displayStatus = status;
        if (status === 'SCHED') displayStatus = 'SCHED';
        else if (status === 'DEPARTED') displayStatus = 'TAXI-OUT';
        else if (status === 'AIRBORNE') displayStatus = 'ENROUTE';
        else if (status === 'LANDED') displayStatus = 'TAXI-IN';
        else if (status === 'ARRIVED') displayStatus = 'RAMP-IN';
        
        tr.innerHTML = `
            <td>${dateColHtml}</td>
            <td><strong>${f.flight_number || '-'}</strong></td>
            <td>${f.aircraft_reg || '-'}</td>
            <td>${f.dep_airport || '-'}</td>
            <td>${f.arr_airport || '-'}</td>
            <td>${stdHtml}</td>
            <td>${etdHtml}</td>
            <td>${atdHtml}</td>
            <td>${staHtml}</td>
            <td>${etaHtml}</td>
            <td>${ataHtml}</td>
            <td><span class="status-badge status-${status}">${displayStatus}</span></td>
        `;
        tr.addEventListener('click', () => openOfpModal(f.id, f.flight_number, f.dep_gate, f.arr_gate));
        tbody.appendChild(tr);
    });

    // 🌟 탐색 모드일 때만 처음 1회 -2시간 위치로 스크롤 포커스! (대시보드 모드는 맨 위 고정)
    if (window.isExploreMode) {
        if (!window.initialScheduleScrollDone && activeTableFlights.length > 0) {
            setTimeout(() => {
                const container = document.querySelector('.table-container');
                if (!container) return;
                
                const targetTime = NOW.getTime() - (2 * 60 * 60 * 1000); // 현재 시간 - 2시간
                
                let targetIndex = activeTableFlights.findIndex(f => {
                    let d = getFlightDate(f, f.std_z || "");
                    if (!d) d = new Date(f.flight_date_z + "T23:59:59Z");
                    return d.getTime() >= targetTime;
                });
                
                if (targetIndex !== -1) {
                    const rows = tbody.querySelectorAll('tr');
                    if (rows[targetIndex]) {
                        container.scrollTop = rows[targetIndex].offsetTop - 40; 
                    }
                }
                window.initialScheduleScrollDone = true;
            }, 100);
        }
    } else {
        const container = document.querySelector('.table-container');
        if (container) container.scrollTop = 0; // 대시보드 모드: 스크롤 초기화
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnTimeZulu = document.getElementById('btnTimeZulu');
    const btnTimeKst = document.getElementById('btnTimeKst');

    function setTimezone(isKst) {
        if (typeof displayTimezone !== 'undefined' && typeof currentFlights !== 'undefined') {
            displayTimezone = isKst ? 'KST' : 'ZULU';
            
            if (isKst) {
                btnTimeKst.classList.add('time-active');
                btnTimeZulu.classList.remove('time-active');
            } else {
                btnTimeZulu.classList.add('time-active');
                btnTimeKst.classList.remove('time-active');
            }
            
            renderDashboard(currentFlights);
            if (typeof renderFidsBoard === 'function') renderFidsBoard();
        }
    }

    if (btnTimeZulu && btnTimeKst) {
        btnTimeZulu.addEventListener('click', () => setTimezone(false));
        btnTimeKst.addEventListener('click', () => setTimezone(true));
    }
});
