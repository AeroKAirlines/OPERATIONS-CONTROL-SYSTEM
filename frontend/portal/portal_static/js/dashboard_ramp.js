// /portal_static/js/dashboard_ramp.js

// 🌟 12L까지 extra: true 추가 (기본 화면에는 11개만 표시됨)
const CJJ_STANDS =[
    { id: '13R', type: 'remote', zone: 'INTL', extra: true },
    { id: '13L', type: 'remote', zone: 'INTL', extra: true },
    { id: '13',  type: 'remote', zone: 'INTL', extra: true },
    { id: '12R', type: 'remote', zone: 'INTL', extra: true },
    { id: '12L', type: 'remote', zone: 'INTL', extra: true }, // ✨ 숨김 처리
    { id: '11',  type: 'remote', zone: 'INTL' },
    { id: '10',  type: 'remote', zone: 'INTL' },
    { id: '9',   type: 'remote', zone: 'INTL' },
    { id: '8',   type: 'remote', zone: 'INTL' },
    { id: '7',   type: 'bridge stretched', zone: 'INTL' },
    { id: '6',   type: 'bridge', zone: 'INTL' },
    { id: '5',   type: 'remote swing', zone: 'SWING' },
    { id: '4',   type: 'bridge', zone: 'DOM' },
    { id: '3',   type: 'bridge', zone: 'DOM' },
    { id: '2',   type: 'bridge', zone: 'DOM' },
    { id: '1',   type: 'remote', zone: 'DOM' }
];

let showExtraStands = false;

function initRampMap() {
    const container = document.getElementById('cjj-map');
    if (!container) return;

    container.innerHTML = `
        <div class="ramp-dashboard">
            <button id="btnToggleStands" class="btn-toggle-stands">EXPAND</button>
            <div class="ramp-runways">
                <div class="runway-line"><span class="runway-designator text-right">24L</span><div class="runway-track"></div><span class="runway-designator">06R</span></div>
                <div class="runway-line"><span class="runway-designator text-right">24R</span><div class="runway-track"></div><span class="runway-designator">06L</span></div>
            </div>
            <div class="ramp-apron" id="ramp-stands-container"></div>
        </div>
    `;

    const apronContainer = document.getElementById('ramp-stands-container');
    
    CJJ_STANDS.forEach(stand => {
        const standEl = document.createElement('div');
        standEl.className = `stand ${stand.type} status-empty`;
        standEl.id = `stand-group-${stand.id}`;
        if (stand.extra) standEl.classList.add('extra-stand');

        standEl.innerHTML = `
            <div class="aircraft-wrapper">
                <svg class="aircraft-icon" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                </svg>
            </div>
            <div class="stand-box">
                <div class="vdgs-tag">
                    <div class="vdgs-header">
                        <span class="vdgs-flt" id="flt-${stand.id}">-</span>
                        <span class="vdgs-reg" id="reg-${stand.id}">-</span>
                    </div>
                    <div class="vdgs-times">
                        <div class="vdgs-time-block">
                            <span class="vdgs-time-lbl">IN</span>
                            <span class="vdgs-time-val" id="in-${stand.id}">-</span>
                        </div>
                        <div class="vdgs-time-block right">
                            <span class="vdgs-time-lbl">OUT</span>
                            <span class="vdgs-time-val" id="out-${stand.id}">-</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="stand-label">${stand.id}</div>
        `;
        apronContainer.appendChild(standEl);
    });

    document.getElementById('btnToggleStands').addEventListener('click', () => {
        showExtraStands = !showExtraStands;
        applyStandVisibility();
        
        // ✨ 펼쳤을 때 왼쪽 끝으로 스르륵 이동하여 추가된 주기장을 보여줌
        if (showExtraStands) setTimeout(() => { apronContainer.scrollLeft = 0; }, 50);
    });
    applyStandVisibility();
}

function applyStandVisibility() {
    const extraStands = document.querySelectorAll('.extra-stand');
    const btn = document.getElementById('btnToggleStands');
    if (showExtraStands) {
        extraStands.forEach(el => el.classList.remove('stand-hidden'));
        if(btn) btn.innerText = "COLLAPSE"; // 버튼 이름 심플하게
    } else {
        extraStands.forEach(el => el.classList.add('stand-hidden'));
        if(btn) btn.innerText = "EXPAND";
    }
}

// 기존 dashboard_ramp.js 의 updateRampMap 함수를 아래로 통째로 덮어쓰세요!
// (위에 있는 initRampMap, CJJ_STANDS 배열 등은 그대로 두시면 됩니다)

async function updateRampMap(flights_unused, fidsData_unused) {
    // 1. 모든 주기장을 텅 빈 상태로 초기화
    CJJ_STANDS.forEach(stand => {
        const group = document.getElementById(`stand-group-${stand.id}`);
        if(group) {
            group.classList.remove('status-eok', 'status-oal');
            group.classList.add('status-empty');
            
            const fltEl = document.getElementById(`flt-${stand.id}`);
            const regEl = document.getElementById(`reg-${stand.id}`);
            const inEl = document.getElementById(`in-${stand.id}`);
            const outEl = document.getElementById(`out-${stand.id}`);
            
            if (fltEl) fltEl.innerText = '';
            if (regEl) regEl.innerText = '';
            if (inEl) inEl.innerText = '-';
            if (outEl) outEl.innerText = '-';
        }
    });

    const now = new Date();
    // 어제부터 내일까지의 데이터를 가져와서 Overnight(체류) 항공기 흐름 완벽 추적
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const tom = new Date(now); tom.setDate(now.getDate() + 1);

    const formatDate = (d) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    try {
        // Ramp App의 실제 타임라인 흐름 데이터를 비동기로 호출
        const res = await fetch(`/ramp/api/schedules?start_date=${formatDate(yest)}&end_date=${formatDate(tom)}`);
        const json = await res.json();
        if (json.status !== 'success') return;

        const items = json.data.timeline.items;

        // 기번(또는 타사 임시기번 OTHER_X)별로 도착/출발 짝을 묶음
        const regGroups = {};
        items.forEach(item => {
            if (!item.isActive) return;
            let r = item.reg || item.flight;
            if (!regGroups[r]) regGroups[r] = { arr: null, dep: null };
            if (item.flightType === 'ARR') regGroups[r].arr = item;
            if (item.flightType === 'DEP') regGroups[r].dep = item;
        });

        const parseKST = (str) => {
            if (!str) return null;
            const [d, t] = str.split(' ');
            if (!d || !t) return null;
            const [y, m, day] = d.split('-');
            const [H, M] = t.split(':');
            return new Date(y, m-1, day, H, M);
        };

        let standOccupants = {};

        Object.keys(regGroups).forEach(reg => {
            const { arr, dep } = regGroups[reg];
            
            let inTime = arr ? parseKST(arr.start) : null;
            let outTime = dep ? parseKST(dep.start) : null;

            // 단방향 스케줄 처리 (도착만 있거나 출발만 있는 경우 체류시간 3시간 가정)
            if (inTime && !outTime) outTime = new Date(inTime.getTime() + 3 * 60 * 60 * 1000); 
            if (!inTime && outTime) inTime = new Date(outTime.getTime() - 3 * 60 * 60 * 1000);

            // 🌟 램프 흐름 추적 핵심: 현재 시간(NOW)이 해당 비행기의 [도착~출발] 블록 사이에 있다면 서있는 것!
            if (inTime && outTime && now >= inTime && now <= outTime) {
                const stand = arr ? arr.group : dep.group;
                if (!stand) return;

                let isEok = false;
                if ((arr && (arr.flight.startsWith('RF') || arr.flight.startsWith('EOK'))) ||
                    (dep && (dep.flight.startsWith('RF') || dep.flight.startsWith('EOK')))) {
                    isEok = true;
                }

                standOccupants[stand] = {
                    reg: reg.startsWith('OTHER_') ? 'OAL' : (reg === 'UNKNOWN' ? 'TBA' : reg),
                    fltArr: arr ? arr.flight : '',
                    fltDep: dep ? dep.flight : '',
                    inStr: arr ? arr.start.substring(11, 16) : '-',
                    outStr: dep ? dep.start.substring(11, 16) : '-',
                    isEok: isEok
                };
            }
        });

        // 3. 최종 상태를 DOM에 렌더링
        Object.keys(standOccupants).forEach(standNo => {
            const group = document.getElementById(`stand-group-${standNo}`);
            if (!group) return;
            const data = standOccupants[standNo];

            group.classList.remove('status-empty');
            if (data.isEok) group.classList.add('status-eok');
            else group.classList.add('status-oal');

            const flts = [];
            if (data.fltArr) flts.push(data.fltArr);
            if (data.fltDep && data.fltDep !== data.fltArr) flts.push(data.fltDep);

            const fltEl = document.getElementById(`flt-${standNo}`);
            const regEl = document.getElementById(`reg-${standNo}`);
            const inEl = document.getElementById(`in-${standNo}`);
            const outEl = document.getElementById(`out-${standNo}`);

            if (fltEl) fltEl.innerText = flts.join('/');
            if (regEl) regEl.innerText = data.reg;
            if (inEl) inEl.innerText = data.inStr;
            if (outEl) outEl.innerText = data.outStr;
        });

    } catch (e) {
        console.error("Ramp Sync Error", e);
    }
}