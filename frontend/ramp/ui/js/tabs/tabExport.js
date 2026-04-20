import { itemsDataSet } from '../core/store.js';
import { getIATA } from '../core/utils.js';

let selectedExportIds = new Set();

export function renderExportTable() {
    const tbody = document.querySelector('#exportTable tbody');
    tbody.innerHTML = '';

    const targetDate = document.getElementById('exportTargetDate').value;

    let items = itemsDataSet.get({
        filter: i => {
            if (i.type !== 'point' || i.isLink || i.isOther || i.isActive === false) return false;

            const baseStart = i.originalStart || i.start;
            // 🌟 띄어쓰기와 T 모두 완벽하게 날짜(YYYY-MM-DD)만 잘라냄
            const itemDate = baseStart.includes('T') ? baseStart.split('T')[0] : baseStart.split(' ')[0];

            if (targetDate && itemDate !== targetDate) return false;
            return true;
        }
    });

    items.sort((a, b) => {
        const regA = a.reg || 'UNKNOWN'; const regB = b.reg || 'UNKNOWN';
        if (regA !== regB) return regA.localeCompare(regB);
        return new Date(a.start.replace(' ', 'T')).getTime() - new Date(b.start.replace(' ', 'T')).getTime();
    });

    const allItems = itemsDataSet.get({ filter: i => i.type === 'point' && !i.isLink && !i.isOther && i.isActive !== false });
    allItems.sort((a, b) => new Date(a.start.replace(' ', 'T')).getTime() - new Date(b.start.replace(' ', 'T')).getTime());

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

        // 🌟 시간 변환 시 발생할 수 있는 크래시 완벽 방어
        const safeBaseStart = baseStart.replace(' ', 'T');
        const safeLiveStart = liveStart.replace(' ', 'T');
        const dBase = new Date(safeBaseStart);
        const dLive = new Date(safeLiveStart);

        const dateStr = `${String(dBase.getFullYear()).slice(2)}/${String(dBase.getMonth() + 1).padStart(2, '0')}/${String(dBase.getDate()).padStart(2, '0')}`;
        const flt = (item.flight || '').replace('RF', '');
        const reg = item.reg || '';
        const cityIATA = getIATA(item.city || '');
        const dep = item.flightType === 'ARR' ? cityIATA : 'CJJ';
        const arr = item.flightType === 'ARR' ? 'CJJ' : cityIATA;

        const extractTime = (str) => str.includes('T') ? str.split('T')[1].substring(0, 5) : str.split(' ')[1].substring(0, 5);
        const baseTimeStr = extractTime(baseStart);
        const liveTimeStr = extractTime(liveStart);

        let std = '', sta = '', etd = '', eta = '';
        if (item.flightType === 'DEP') { std = baseTimeStr; if (baseStart !== liveStart) etd = liveTimeStr; }
        else { sta = baseTimeStr; if (baseStart !== liveStart) eta = liveTimeStr; }

        const isMod = item.rawStand !== item.originalRawStand;
        const pairItem = item.pairId ? itemsDataSet.get(item.pairId) : null;
        const isPairMod = pairItem && (pairItem.rawStand !== pairItem.originalRawStand);
        const needsBlue = isMod || isPairMod;
        const isCompleted = item.isReqCompleted;

        let rowClass = '';
        if (isCompleted) rowClass += 'is-completed ';
        if (selectedExportIds.has(item.id)) rowClass += 'is-selected ';

        let dStand = '', aStand = '', dClass = '', aClass = '';

        if (item.flightType === 'DEP') {
            dStand = item.rawStand !== '미정' ? item.rawStand : '';
            dClass += 'target-stand-cell ';
            if (isMod && dStand !== '') dClass += 'actual-mod-cell ';
            if (needsBlue) dClass += 'mod-stand-cell ';
        } else {
            aStand = item.rawStand !== '미정' ? item.rawStand : '';
            aClass += 'target-stand-cell ';
            if (isMod && aStand !== '') aClass += 'actual-mod-cell ';
            if (needsBlue) aClass += 'mod-stand-cell ';
        }

        let layover = '';
        if (item.flightType === 'ARR') {
            const nextFlights = allItems.filter(i => i.reg === item.reg && new Date(i.start.replace(' ', 'T')).getTime() > dLive.getTime());
            if (nextFlights.length > 0) {
                const nextFlt = nextFlights[0];
                if (nextFlt.flightType === 'DEP') {
                    const nextDLive = new Date(nextFlt.start.replace(' ', 'T'));
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
    document.getElementById('exportTargetDate').addEventListener('change', renderExportTable);
    document.getElementById('btnExportFilterClear').addEventListener('click', () => {
        document.getElementById('exportTargetDate').value = '';
        renderExportTable();
    });

    document.getElementById('btnToggleReqComplete').addEventListener('click', () => {
        if (selectedExportIds.size === 0) return alert('완료/취소 처리할 스케줄을 표에서 1개 이상 클릭하여 선택해주세요.');

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

        selectedExportIds.clear();
        renderExportTable();
    });
}