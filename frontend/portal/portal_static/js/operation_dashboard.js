let displayTimezone = 'ZULU'; 
let currentFlights = [];
window.isExploreMode = false;
window.initialScheduleScrollDone = false;
window.initialFidsScrollDone = false;

async function syncDashboardData() {
    try {
        const[schedRes, acarsRes, statsRes, cfdRes] = await Promise.all([
            fetch('/api/flights/master-schedule'),
            fetch('/api/acars/positions'),
            fetch('/api/flights/daily-stats'),
            fetch('/api/acars/cfd')
        ]);
        const flights = await schedRes.json();
        const positions = await acarsRes.json();
        const stats = await statsRes.json();
        const cfdMessages = await cfdRes.json();

        currentFlights = flights; 
        window.currentFlights = flights;
        window.currentPositions = positions;
        window.currentCfdMessages = cfdMessages;

        const ids =['stat-total', 'stat-airborne', 'stat-scheduled', 'stat-delayed'];
        const keys =['total', 'airborne', 'scheduled', 'delayed'];
        ids.forEach((id, i) => { const el = document.getElementById(id); if (el) el.innerText = stats[keys[i]]; });

        // 🌟 KAC FIDS 데이터 비동기 호출 (dashboard_fids.js 에 있음)
        if (typeof fetchFidsData === 'function') {
            await fetchFidsData();
        }

        if (typeof renderDashboard === 'function') renderDashboard(flights);
        if (typeof updateMap === 'function') updateMap(flights, positions);

    } catch (e) { console.error("Sync Error:", e); }
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof initMap === 'function') initMap();
    
    // 🌟 모드 전환 (Segmented Control) 로직
    const btnDashMode = document.getElementById('btnDashMode');
    const btnExploreMode = document.getElementById('btnExploreMode');

    function setMode(isExplore) {
        window.isExploreMode = isExplore;
        
        if (isExplore) {
            btnExploreMode.classList.add('mode-active');
            btnDashMode.classList.remove('mode-active');
        } else {
            btnDashMode.classList.add('mode-active');
            btnExploreMode.classList.remove('mode-active');
        }
        
        // 모드 전환 시 스크롤 포커스를 위해 상태 리셋
        window.initialScheduleScrollDone = false;
        window.initialFidsScrollDone = false;
        
        // 데이터 즉각 재렌더링
        if (typeof renderDashboard === 'function' && currentFlights) renderDashboard(currentFlights);
        if (typeof renderFidsBoard === 'function') renderFidsBoard();
    }

    if (btnDashMode && btnExploreMode) {
        btnDashMode.addEventListener('click', () => setMode(false));
        btnExploreMode.addEventListener('click', () => setMode(true));
    }

    syncDashboardData(); 
    setInterval(syncDashboardData, 30000); 
});