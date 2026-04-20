// dashboard_fids.js

let globalFidsData = [];

const CITY_MAP = {
    "CJJ": "청주", "GMP": "김포", "CJU": "제주", "PUS": "김해", "TAE": "대구",
    "KWJ": "광주", "USN": "울산", "RSU": "여수", "WJU": "원주", "YNY": "양양",
    "HIN": "사천", "KUV": "군산", "MWX": "무안", "POB": "포항경주", "ICN": "인천",
    "NRT": "나리타", "KIX": "간사이", "FUK": "후쿠오카", "TPE": "타이페이"
};

const AIRLINE_LOGO = {
    "7C": "7C.svg", "BX": "BX.png", "KE": "KE.svg", "LJ": "LJ.svg",
    "OZ": "OZ.png", "RF": "RF.png", "TW": "TW.svg", "ZE": "ZE.svg"
};

function getAirlineLogo(airlineCode) {
    const logoFile = AIRLINE_LOGO[airlineCode];
    if (logoFile) {
        return `<img class="al-logo-img" src="/portal_static/img/Logo/${logoFile}" alt="${airlineCode}" onerror="this.outerHTML='<span class=\\'al-logo\\'>${airlineCode}</span>'">`;
    }
    return `<span class="al-logo">${airlineCode}</span>`;
}

async function fetchFidsData() {
    const arrList = document.getElementById('list-arrivals');
    const depList = document.getElementById('list-departures');

    // 🌟 깜빡임 방지: 데이터가 아예 없을 때(최초 로딩)만 로딩 메시지 표출
    if (globalFidsData.length === 0) {
        if (arrList) arrList.innerHTML = '<div class="loading-msg">데이터 로딩 중...</div>';
        if (depList) depList.innerHTML = '<div class="loading-msg">데이터 로딩 중...</div>';
    }

    const targetDate = new Date().toLocaleDateString('en-CA').replace(/-/g, '');

    try {
        const res = await fetch(`/api/proxy/detail?schDate=${targetDate}&schAirCode=CJJ`);
        if (!res.ok) throw new Error(`API 응답 오류: ${res.status}`);

        const json = await res.json();
        globalFidsData = json.data || [];

        renderFidsBoard();
    } catch (e) {
        console.error("FIDS Fetch Error:", e);
        // 에러가 났을 때만 메시지를 띄움 (기존 데이터가 있으면 굳이 안 지움)
        if (globalFidsData.length === 0) {
            const errMsg = `<div style="padding: 40px; text-align: center; color: #f87171;">통신 실패<br><span style="font-size:10px;">(${e.message})</span></div>`;
            if (arrList) arrList.innerHTML = errMsg;
            if (depList) depList.innerHTML = errMsg;
        }
    }
}

function renderFidsBoard() {
    const arrList = document.getElementById('list-arrivals');
    const depList = document.getElementById('list-departures');
    if (!arrList || !depList) return;

    if (globalFidsData.length === 0) {
        const emptyMsg = `
            <div style="padding: 40px 20px; text-align: center; color: #8b9bb4;">
                <span style="font-weight: bold;">조회 성공</span><br>
                <span style="font-size: 11px;">예정된 운항편이 없습니다.</span>
            </div>`;
        arrList.innerHTML = emptyMsg;
        depList.innerHTML = emptyMsg;
        return;
    }

    const now = new Date();
    // 🌟 대시보드 모드: -1시간 ~ +12시간 | 탐색 모드: -12시간 ~ +12시간
    const minTime = window.isExploreMode ? new Date(now.getTime() - (12 * 60 * 60 * 1000)) : new Date(now.getTime() - (1 * 60 * 60 * 1000));
    const maxTime = new Date(now.getTime() + (12 * 60 * 60 * 1000));

    let processedFlights = globalFidsData.map(item => {
        let timeRaw = String(item.STD || item.ETD || '');
        if (timeRaw.length === 4) {
            let hh = parseInt(timeRaw.substring(0, 2), 10);
            let mm = parseInt(timeRaw.substring(2, 4), 10);
            item._fltDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
        } else {
            item._fltDate = new Date(0);
        }
        return item;
    }).filter(item => {
        return item._fltDate >= minTime && item._fltDate <= maxTime;
    });

    let arrivals = processedFlights.filter(it => it.IO === 'I' || it.IO === 'ARR');
    let departures = processedFlights.filter(it => it.IO === 'O' || it.IO === 'DEP');

    arrivals.sort((a, b) => a._fltDate - b._fltDate);
    departures.sort((a, b) => a._fltDate - b._fltDate);

    // 🌟 대시보드 모드: 8개만 표시, 스크롤 안 함
    // 🌟 탐색 모드: 무제한(100개) 표시, 최초 로딩 시 -1시간 지점으로 스크롤 포커스
    const MAX_ROWS = window.isExploreMode ? 100 : 8; 
    renderList(arrList, arrivals.slice(0, MAX_ROWS), 'ARR');
    renderList(depList, departures.slice(0, MAX_ROWS), 'DEP');

    if (window.isExploreMode) {
        if (!window.initialFidsScrollDone) {
            setTimeout(() => {
                scrollToTargetTime(arrList, arrivals.slice(0, MAX_ROWS));
                scrollToTargetTime(depList, departures.slice(0, MAX_ROWS));
                window.initialFidsScrollDone = true;
            }, 100); 
        }
    } else {
        // 대시보드 모드일 때는 최상단에 고정
        arrList.scrollTop = 0;
        depList.scrollTop = 0;
    }
}

function scrollToTargetTime(container, items) {
    if (!items || items.length === 0) return;
    
    const now = new Date();
    const targetTime = now.getTime() - (1 * 60 * 60 * 1000); // 딱 -1시간
    
    // 현재시간 -1시간보다 크거나 같은(가장 가까운 미래/현재/과거1시간) 첫 번째 항목 찾기
    let targetIndex = items.findIndex(item => item._fltDate.getTime() >= targetTime);
    
    if (targetIndex !== -1) {
        const rows = container.querySelectorAll('.fids-board-row');
        if (rows[targetIndex]) {
            // board-content 영역의 최상단으로 해당 row를 위치시킴 (CSS 스크롤 숨김 때문에 부드러운 스크롤 제외)
            container.scrollTop = rows[targetIndex].offsetTop - container.offsetTop;
        }
    }
}

function renderList(container, items, type) {
    if (items.length === 0) {
        container.innerHTML = '<div class="loading-msg">운항편 없음</div>';
        return;
    }

    const nowHHmm = new Date().getHours().toString().padStart(2, '0') + new Date().getMinutes().toString().padStart(2, '0');

    let html = '';
    items.forEach(item => {
        const flightNr = item.AIR_FLN || '-';
        const airlineCode = flightNr.substring(0, 2);

        let startCity = CITY_MAP[item.BOARDING_KOR] || item.BOARDING_KOR || '-';
        let endCity = CITY_MAP[item.ARRIVED_KOR] || item.ARRIVED_KOR || '-';
        let dest = type === 'ARR' ? startCity : endCity;

        const std = formatFidsTime(item.STD);
        const etd = formatFidsTime(item.ETD);

        // 과거 시간 여부 (현재 시간보다 지났는가?)
        let timeToCompare = String(item.ETD || item.STD || '');
        let isPast = timeToCompare && timeToCompare < nowHHmm;

        // 🌟 SPOT 데이터 처리 (무조건 GATE 정보 활용)
        let spot = item.GATE || '-';

        // 🌟 스마트 상태 처리 로직
        let status = item.RMK_KOR;
        if (!status && isPast) {
            // 시간이 지났는데 상태가 없으면 출발/도착 처리
            status = type === 'ARR' ? '도착' : '출발';
        } else if (!status) {
            status = type === 'ARR' ? '도착 예정' : '출발 예정';
        }

        // CSS 클래스 할당
        let statusClass = type === 'ARR' ? 'arr' : 'dep';
        if (status.includes('결항')) statusClass = 'cancel';
        if (status.includes('지연')) statusClass = 'delay';
        if (status === '도착 예정' || status === '출발 예정') statusClass = 'sched';

        html += `
            <div class="fids-board-row ${isPast ? 'is-past' : ''}">
                <div class="col-flight">
                    ${getAirlineLogo(airlineCode)}
                    <span class="flight-num">${flightNr}</span>
                </div>
                <div class="col-time">${std}</div>
                <div class="col-dest">${dest}</div>
                <div class="col-spot">${spot}</div> <!-- 🌟 SPOT 열 삽입 -->
                <div class="col-newtime">${etd !== std && etd !== '-' ? etd : ''}</div>
                <div class="col-status ${statusClass}">${status}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function formatFidsTime(val) {
    const str = String(val || '');
    if (!str || str.length < 4) return "-";
    return `${str.substring(0, 2)}:${str.substring(2, 4)}`;
}