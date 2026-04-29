import { itemsDataSet } from '../core/store.js';
import { getIATA } from '../core/utils.js';

let selectedExportIds = new Set();

export function renderExportTable() {
    const tbody = document.querySelector('#exportTable tbody');
    tbody.innerHTML = '';

    const startD = document.getElementById('exportStartDate').value;
    const endD = document.getElementById('exportEndDate').value;

    let items = itemsDataSet.get({
        filter: i => {
            if (i.type !== 'point' || i.isLink || i.isOther || i.isActive === false) return false;
            const baseStart = i.originalStart || i.start;
            const itemDate = baseStart.split('T')[0];
            if (startD && itemDate < startD) return false;
            if (endD && itemDate > endD) return false;
            return true;
        }
    });

    items.sort((a, b) => {
        const regA = a.reg || 'UNKNOWN'; const regB = b.reg || 'UNKNOWN';
        if (regA !== regB) return regA < regB ? -1 : 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    const allItems = itemsDataSet.get({ filter: i => i.type === 'point' && !i.isLink && !i.isOther && i.isActive !== false });
    allItems.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    let prevReg = null;

    items.forEach((item) => {
        if (prevReg !== null && prevReg !== item.reg) {
            const blankTr = document.createElement('tr');
            blankTr.innerHTML = `<td colspan="12" style="height: 25px; border: none !important; background-color: #fff !important; pointer-events:none;"></td>`;
            tbody.appendChild(blankTr);
        }
        prevReg = item.reg;

        const baseStart = item.originalStart || item.start;
        const liveStart = item.start;
        const dBase = new Date(baseStart), dLive = new Date(liveStart); 
        
        const dateStr = `${String(dBase.getFullYear()).slice(2)}/${String(dBase.getMonth() + 1).padStart(2, '0')}/${String(dBase.getDate()).padStart(2, '0')}`;
        const flt = (item.flight || '').replace('RF', ''); 
        const reg = item.reg || '';
        const cityIATA = getIATA(item.city || '');
        const dep = item.flightType === 'ARR' ? cityIATA : 'CJJ';
        const arr = item.flightType === 'ARR' ? 'CJJ' : cityIATA;

        const baseTimeStr = baseStart.split('T')[1].substring(0, 5);
        const liveTimeStr = liveStart.split('T')[1].substring(0, 5);

        let std = '', sta = '', etd = '', eta = '';
        if (item.flightType === 'DEP') { std = baseTimeStr; if (baseStart !== liveStart) etd = liveTimeStr; } 
        else { sta = baseTimeStr; if (baseStart !== liveStart) eta = liveTimeStr; }

        // 물귀신 상태 계산 로직
        const isMod = item.rawStand !== item.originalRawStand;
        const pairItem = item.pairId ? itemsDataSet.get(item.pairId) : null;
        const isPairMod = pairItem && (pairItem.rawStand !== pairItem.originalRawStand);
        const needsBlue = isMod || isPairMod;
        const isCompleted = item.isReqCompleted;

        // 행 단위 클래스 세팅 (선택 여부, 완료 여부)
        let rowClass = '';
        if (isCompleted) rowClass += 'is-completed ';
        if (selectedExportIds.has(item.id)) rowClass += 'is-selected ';

        let dStand = '', aStand = '', dClass = '', aClass = '';
        
        // 🌟 출발(DEP)이면 DStand에만 테두리와 파란색 타겟팅
        if (item.flightType === 'DEP') {
            dStand = item.rawStand !== '미정' ? item.rawStand : '';
            dClass += 'target-stand-cell ';
            if (isMod && dStand !== '') dClass += 'actual-mod-cell ';
            if (needsBlue) dClass += 'mod-stand-cell '; // 완료되어도 파란색 지우지 않음!
        } 
        // 🌟 도착(ARR)이면 AStand에만 테두리와 파란색 타겟팅
        else {
            aStand = item.rawStand !== '미정' ? item.rawStand : '';
            aClass += 'target-stand-cell ';
            if (isMod && aStand !== '') aClass += 'actual-mod-cell ';
            if (needsBlue) aClass += 'mod-stand-cell '; // 완료되어도 파란색 지우지 않음!
        }

        let layover = '';
        if (item.flightType === 'ARR') {
            const nextFlights = allItems.filter(i => i.reg === item.reg && new Date(i.start).getTime() > dLive.getTime());
            if (nextFlights.length > 0) {
                const nextFlt = nextFlights[0];
                if (nextFlt.flightType === 'DEP') { 
                    const nextDLive = new Date(nextFlt.start);
                    const isNextDay = dLive.getDate() !== nextDLive.getDate() || dLive.getMonth() !== nextDLive.getMonth();
                    const isSameDayDawn = (dLive.getDate() === nextDLive.getDate()) && (dLive.getHours() < 5) && (nextDLive.getHours() >= 5);
                    if (isNextDay || isSameDayDawn) layover = nextFlt.flight || '';
                }
            }
        }

        const tr = document.createElement('tr');
        if (rowClass) tr.className = rowClass.trim();
        tr.dataset.id = item.id;
        
        tr.innerHTML = `
            <td>${dateStr}</td><td>${flt}</td><td>${reg}</td><td>${dep}</td><td>${arr}</td>
            <td>${std}</td><td>${sta}</td><td>${etd}</td><td>${eta}</td>
            <td class="${dClass}">${dStand}</td><td class="${aClass}">${aStand}</td><td>${layover}</td>
        `;

        // 행 클릭 시 선택 토글 기능
        tr.addEventListener('click', () => {
            if (selectedExportIds.has(item.id)) {
                selectedExportIds.delete(item.id);
                tr.classList.remove('is-selected');
            } else {
                selectedExportIds.add(item.id);
                tr.classList.add('is-selected');
            }
        });

        tbody.appendChild(tr);
    });

    document.getElementById('exportTotalCount').textContent = `Total Record(s): ${items.length}`;
}

export function initExportTab() {
    document.getElementById('btnRefreshExport').addEventListener('click', renderExportTable);
    document.getElementById('exportStartDate').addEventListener('change', renderExportTable);
    document.getElementById('exportEndDate').addEventListener('change', renderExportTable);
    document.getElementById('btnExportFilterClear').addEventListener('click', () => {
        document.getElementById('exportStartDate').value = '';
        document.getElementById('exportEndDate').value = '';
        renderExportTable();
    });

    // 신청 완료/취소 버튼 토글 로직
    document.getElementById('btnToggleReqComplete').addEventListener('click', () => {
        if(selectedExportIds.size === 0) return alert('완료/취소 처리할 스케줄을 표에서 1개 이상 클릭하여 선택해주세요.');
        
        const updates = [];
        selectedExportIds.forEach(id => {
            const item = itemsDataSet.get(id);
            if (item) {
                const newVal = !item.isReqCompleted;
                updates.push({ id: item.id, isReqCompleted: newVal });
                if (item.pairId) updates.push({ id: item.pairId, isReqCompleted: newVal });
            }
        });
        
        const uniqueUpdates = Array.from(new Map(updates.map(u => [u.id, u])).values());
        itemsDataSet.update(uniqueUpdates);
        
        // 처리 완료 후 선택 해제
        selectedExportIds.clear();
        renderExportTable();
    });
}