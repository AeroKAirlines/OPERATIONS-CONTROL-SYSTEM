import { itemsDataSet, groupsDataSet, itemsDataSetReg, groupsDataSetReg } from '../core/store.js';
import { initTimeline, evaluateConnections, updateItemClasses, timeline } from '../chart.js';
import { openEditPanel, closeEditPanel } from '../components/editPanel.js';

// 🌟 JWT 인증이 포함된 공통 Fetch 함수 (export 추가됨)
export async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('occ_token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    const headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        alert("세션이 만료되었습니다. 다시 로그인 해주세요.");
        localStorage.removeItem('occ_token');
        window.location.href = '/login';
        throw new Error("Unauthorized");
    }
    return response;
}

export async function fetchAndRenderSchedules(startDate, endDate) {
    try {
        const response = await fetchWithAuth(`/ramp/api/schedules?start_date=${startDate}&end_date=${endDate}`);
        const result = await response.json();

        if (result.status === 'success') {
            const fetchedItems = result.data.timeline.items;

            itemsDataSet.clear();
            groupsDataSet.clear();
            itemsDataSetReg.clear();
            groupsDataSetReg.clear();

            if (fetchedItems.length === 0) return;

            const groupSet = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '12L', '12R', '13', '13L', '13R']);
            fetchedItems.forEach(item => {
                const stands = (item.rawStand || '미정').split('-');
                stands.forEach(s => groupSet.add(s));
            });

            const sortedGroups = Array.from(groupSet).sort((a, b) => {
                if (a === '미정') return 9999;
                if (b === '미정') return -9999;
                let valA = a.endsWith('L') ? parseFloat(a) + 0.1 : (a.endsWith('R') ? parseFloat(a) + 0.2 : parseFloat(a));
                let valB = b.endsWith('L') ? parseFloat(b) + 0.1 : (b.endsWith('R') ? parseFloat(b) + 0.2 : parseFloat(b));
                return (isNaN(valA) ? 998 : valA) - (isNaN(valB) ? 998 : valB);
            });

            const newGroups = sortedGroups.map((g, idx) => ({
                id: g,
                content: g !== '미정' ? `STAND ${g}` : "미정 (배정필요)",
                order: idx
            }));

            initTimeline(newGroups, fetchedItems, openEditPanel, closeEditPanel);

        } else {
            alert(`스케줄 조회 에러:\n${result.message}`);
        }
    } catch (error) {
        console.error("서버에서 스케줄 데이터를 가져오는데 실패했습니다.", error);
    }
}