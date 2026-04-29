let globalData = {};
let currentView = 'default';
let displayMode = 'lf'; 
let currentRegion = 'all';

const iataMap = { "인천": "ICN", "청주": "CJJ" };

const regionMap = {
    'CJU':0,
    'KIX':1, 'NRT':1, 'FUK':1, 'CTS':1, 'NGO':1, 'OKA':1, 'IBR':1, 'OBO':1, 'KKJ':1, 'HIJ':1, 'MYJ':1, 'MMJ':1, 'UKB':1, 'FSZ':1, 'KOJ':1, 'NGS':1, 'OIT':1, 'TAK':1, 'KMQ':1, 'HSG':1,
    'TPE':2, 'UBN':2, 'SJW':2, 'YIH':2, 'DSN':2, 'HLD':2, 'LHW':2, 'HUN':2, 'TNA':2, 'TAO':2, 'PVG':2, 'SHA':2, 'PEK':2, 'PKX':2, 'TSN':2, 'DLC':2, 'SHE':2, 'CGQ':2, 'HRB':2, 'NKG':2, 'HGH':2, 'WNZ':2, 'NGB':2, 'FOC':2, 'XMN':2, 'YNT':2, 'WEH':2, 'CGO':2, 'KWE':2, 'KMG':2, 'XIY':2, 'CKG':2, 'CTU':2, 'HKG':2, 'MFM':2, 'KHH':2, 'RMQ':2,
    'CRK':3, 'DAD':3, 'CXR':3, 'CEB':3, 'MNL':3, 'BKK':3, 'SGN':3, 'HAN':3, 'REP':3, 'VTE':3, 'HKT':3, 'CNX':3, 'PQC':3, 'DLI':3, 'SIN':3, 'KUL':3, 'BKI':3, 'DPS':3, 'PEN':3
};

function getColorClass(lfStr) {
    if (lfStr === undefined || lfStr === null || String(lfStr).includes('#')) return 'bg-noop';
    let lf = parseFloat(String(lfStr).replace('%', ''));
    if (isNaN(lf)) return 'bg-noop';
    if (lf < 70) return 'bg-low';
    if (lf < 80) return 'bg-mid';
    if (lf < 90) return 'bg-good';
    if (lf < 100) return 'bg-high';
    return 'bg-full'; // 100% 이상(오버부킹 포함)은 모두 bg-full 처리
}

function generateDateRange(startDateStr, days) {
    let d = new Date(startDateStr);
    let dates =[];
    for(let i=0; i<days; i++) {
        let yy = String(d.getFullYear()).slice(2);
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        dates.push(`${yy}-${mm}-${dd}`);
        d.setDate(d.getDate() + 1);
    }
    return dates;
}

function formatDayHeader(dateStr) {
    const parts = dateStr.split('-');
    const d = new Date(2000 + parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const days =['일','월','화','수','목','금','토'];
    let dayColor = "#555";
    if(d.getDay() === 0) dayColor = "#c82323"; 
    if(d.getDay() === 6) dayColor = "#0056b3"; 
    
    return `${parts[1]}/${parts[2]}<br><span style="font-size:11px; color:${dayColor};">${days[d.getDay()]}</span>`;
}

function switchView(viewName) {
    currentView = viewName;
    document.getElementById('btn-view-default').classList.remove('active');
    document.getElementById('btn-view-kal').classList.remove('active');
    document.getElementById(`btn-view-${viewName}`).classList.add('active');
    renderDashboard();
}

function switchMode(mode) {
    displayMode = mode;
    document.getElementById('btn-mode-lf').classList.remove('active');
    document.getElementById('btn-mode-pax').classList.remove('active');
    document.getElementById(`btn-mode-${mode}`).classList.add('active');
    renderDashboard();
}

function switchRegion(region) {
    currentRegion = region;
    ['all', 0, 1, 2, 3].forEach(r => document.getElementById(`btn-region-${r}`).classList.remove('active'));
    document.getElementById(`btn-region-${region}`).classList.add('active');
    renderDashboard();
}

async function loadData() {
    try {
        const response = await fetch('/booking/api/data');
        globalData = await response.json();
        
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('start-date').value = `${yyyy}-${mm}-${dd}`;
        
        renderDashboard();
    } catch (e) {
        document.getElementById('dashboard').innerHTML = '<div style="color:red;">데이터 로드 실패</div>';
    }
}

function renderDashboard() {
    const targetDates = generateDateRange(document.getElementById('start-date').value, 15);
    if (currentView === 'default') renderDefaultView(targetDates);
    else renderKALView(targetDates);
}

function getCellHTML(record) {
    if (!record) return `<td class="bg-noop"></td>`;
    let displayLf = String(record.lf);
    if (displayLf.includes('#')) displayLf = '-';
    else if (displayLf !== '-' && !displayLf.includes('%')) displayLf += '%';
    
    const colorClass = getColorClass(record.lf);
    
    let cellText = '';
    let tooltipText = '';

    if (displayMode === 'lf') {
        cellText = displayLf;
        tooltipText = `공급석: ${record.cfg}석\n예약수: ${record.ttl}명`;
    } else {
        cellText = (displayLf === '-') ? '-' : record.ttl; 
        tooltipText = `예약률: ${displayLf}\n공급석: ${record.cfg}석`;
    }
    return `<td class="cell-lf ${colorClass}" data-tooltip="${tooltipText}">${cellText}</td>`;
}

const sortFlights = (a, b) => {
    const hubA = a.hub === '인천' ? 1 : (a.hub === '청주' ? 2 : 3);
    const hubB = b.hub === '인천' ? 1 : (b.hub === '청주' ? 2 : 3);
    if (hubA !== hubB) return hubA - hubB;

    const regA = regionMap[a.dest] !== undefined ? regionMap[a.dest] : 4;
    const regB = regionMap[b.dest] !== undefined ? regionMap[b.dest] : 4;
    if (regA !== regB) return regA - regB;

    if (a.dest !== b.dest) return a.dest.localeCompare(b.dest);
    return a.dep.localeCompare(b.dep);
};

// 🌟 15일 내에 스케줄이 없는 도시는 아예 화면에서 숨기도록 로직 개선
function renderDefaultView(targetDates) {
    let html = '';
    
    const sortedDests = Object.keys(globalData).sort((a, b) => {
        const regA = regionMap[a] !== undefined ? regionMap[a] : 4;
        const regB = regionMap[b] !== undefined ? regionMap[b] : 4;
        if (regA !== regB) return regA - regB;
        return a.localeCompare(b);
    });

    for (const dest of sortedDests) {
        const regCode = regionMap[dest] !== undefined ? regionMap[dest] : 4;
        if (currentRegion !== 'all' && regCode !== currentRegion) continue;

        const info = globalData[dest];
        
        // 🌟 핵심: 표(Table) 부분의 HTML을 먼저 임시로 조립해 봅니다.
        let destHtml = ''; 

        for (const[hub, directions] of Object.entries(info.routes)) {
            ['왕편', '복편'].forEach(dir => {
                const flightsObj = directions[dir];
                if (Object.keys(flightsObj).length === 0) return;

                // 15일 이내에 데이터가 존재하는 비행편만 필터링
                let flightsArr = Object.values(flightsObj).filter(flight => {
                    return targetDates.some(date => flight.records[date] !== undefined);
                }).sort((a, b) => a.dep.localeCompare(b.dep));
                
                // 만약 이 방향(왕편/복편)에 비행기가 한 대도 없다면 표를 그리지 않고 넘김
                if (flightsArr.length === 0) return; 

                let dirClass = dir === '왕편' ? 'badge-out' : 'badge-in';
                destHtml += `
                    <div class="direction-title">
                        <span class="dir-badge ${dirClass}">${dir}</span>
                        <span class="hub-text">${hub} 출발</span>
                    </div>
                    <div class="table-container">
                        <table class="table-default">
                            <thead>
                                <tr>
                                    <th class="sticky-col">편명</th>
                                    <th class="sticky-col">출발</th>
                                    <th class="sticky-col">도착</th>
                `;
                targetDates.forEach(date => { destHtml += `<th class="date-header">${formatDayHeader(date)}</th>`; });
                destHtml += `</tr></thead><tbody>`;

                flightsArr.forEach(flight => {
                    destHtml += `<tr>
                        <td class="sticky-col fw-bold">${flight.flight_no}</td>
                        <td class="sticky-col">${flight.dep}</td>
                        <td class="sticky-col">${flight.arr}</td>`;
                    targetDates.forEach(date => {
                        destHtml += getCellHTML(flight.records[date]);
                    });
                    destHtml += `</tr>`;
                });
                destHtml += `</tbody></table></div>`;
            });
        }
        
        // 🌟 임시로 조립해 본 표(destHtml)에 내용이 있을 때만! 제목과 함께 메인 화면에 붙여넣습니다.
        if (destHtml !== '') {
            html += `
                <div class="dest-section">
                    <div class="dest-title"><span class="dest-badge">${dest}</span> 노선 스케줄</div>
                    ${destHtml}
                </div>
            `;
        }
    }
    
    // 최종적으로 화면에 그릴 내용이 아예 없다면 안내 문구 출력
    if (html === '') html = '<div style="padding: 50px; text-align:center; font-weight:bold; color:#666;">해당 기간 및 권역에 운항하는 스케줄이 없습니다.</div>';
    
    document.getElementById('dashboard').innerHTML = html;
}

// 🌟 통합 스케줄 이모지 제거
function renderKALView(targetDates) {
    let allFlights =[];
    for (const dest in globalData) {
        const regCode = regionMap[dest] !== undefined ? regionMap[dest] : 4;
        if (currentRegion !== 'all' && regCode !== currentRegion) continue;

        for (const hub in globalData[dest].routes) {
            for (const dir in globalData[dest].routes[hub]) {
                for (const f_no in globalData[dest].routes[hub][dir]) {
                    let f = globalData[dest].routes[hub][dir][f_no];
                    let depIata = iataMap[hub] || hub;
                    let arrIata = dest; 
                    
                    if (dir === '복편') f.route_iata = `${arrIata}${depIata}`; 
                    else f.route_iata = `${depIata}${arrIata}`; 
                    
                    f.direction = dir;
                    f.hub = hub;   
                    f.dest = dest; 
                    allFlights.push(f);
                }
            }
        }
    }

    const outbound = allFlights.filter(f => f.direction === '왕편').sort(sortFlights);
    const inbound = allFlights.filter(f => f.direction === '복편').sort(sortFlights);

    let html = '';
    html += `<div class="dest-section"><div class="dest-title"><span class="dir-badge badge-out">1 구간</span> 출국편 스케줄</div>`;
    html += buildKALTable(outbound, targetDates);
    html += `</div>`;

    html += `<div class="dest-section"><div class="dest-title"><span class="dir-badge badge-in">2 구간</span> 귀국편 스케줄</div>`;
    html += buildKALTable(inbound, targetDates);
    html += `</div>`;

    document.getElementById('dashboard').innerHTML = html;
}

function buildKALTable(flightsArr, targetDates) {
    let visibleFlights = flightsArr.filter(flight => {
        return targetDates.some(date => flight.records[date] !== undefined);
    });

    if (visibleFlights.length === 0) return '<div style="padding: 20px; color:#666;">선택하신 조건에 운항하는 스케줄이 없습니다.</div>';

    let html = `<div class="table-container">
        <table class="table-kal">
            <thead>
                <tr>
                    <th class="sticky-col">구간</th>
                    <th class="sticky-col">편명</th>
                    <th class="sticky-col">출발</th>
                    <th class="sticky-col">도착</th>`;
                    
    targetDates.forEach(date => { html += `<th class="date-header">${formatDayHeader(date)}</th>`; });
    html += `</tr></thead><tbody>`;

    visibleFlights.forEach(flight => {
        html += `<tr>
            <td class="sticky-col route-text">${flight.route_iata}</td>
            <td class="sticky-col fw-bold">${flight.flight_no}</td>
            <td class="sticky-col">${flight.dep}</td>
            <td class="sticky-col">${flight.arr}</td>`;
            
        targetDates.forEach(date => {
            html += getCellHTML(flight.records[date]);
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
}

loadData();