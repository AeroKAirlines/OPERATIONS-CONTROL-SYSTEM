import { itemsDataSet, groupsDataSet } from '../core/store.js';
import { CONFIG } from '../core/config.js';
import { updateItemClasses, evaluateConnections } from '../chart.js';

export function renderScheduleTable() {
    const tbody = document.querySelector('#scheduleTable tbody');
    tbody.innerHTML = '';
    
    const sortType = document.getElementById('selSortTable').value;
    const startD = document.getElementById('filterStartDate').value;
    const endD = document.getElementById('filterEndDate').value;
    
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
        const baseStartA = a.originalStart || a.start;
        const baseStartB = b.originalStart || b.start;
        const timeA = new Date(baseStartA).getTime();
        const timeB = new Date(baseStartB).getTime();
        
        if (sortType === 'reg') {
            const regA = a.reg || 'UNKNOWN';
            const regB = b.reg || 'UNKNOWN';
            if (regA !== regB) return regA < regB ? -1 : 1;
            return timeA - timeB;
        } else return timeA - timeB;
    });

    let prevGroupKey = null;
    let groupToggle = false;

    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        
        if (sortType === 'reg') {
            let currentGroupKey = (item.reg || 'UNKNOWN');
            if (currentGroupKey !== prevGroupKey) {
                groupToggle = !groupToggle;
                prevGroupKey = currentGroupKey;
                tr.classList.add('group-start'); 
            }
            tr.classList.add(groupToggle ? 'group-color-a' : 'group-color-b'); 
        }

        const baseStart = item.originalStart || item.start;
        const datePart = baseStart.split('T')[0];
        const timePart = baseStart.split('T')[1].substring(0, 5);

        let regOptions = `<option value="UNKNOWN">미정</option>`;
        CONFIG.AIRCRAFT_REGS.forEach(r => { regOptions += `<option value="${r}" ${item.reg === r ? 'selected' : ''}>${r}</option>`; });

        const selectClass = item.flightType === 'ARR' ? 'type-arr' : 'type-dep';

        tr.innerHTML = `
            <td>
                <select class="inp-type ${selectClass}">
                    <option value="ARR" ${item.flightType === 'ARR' ? 'selected' : ''}>ARR</option>
                    <option value="DEP" ${item.flightType === 'DEP' ? 'selected' : ''}>DEP</option>
                </select>
            </td>
            <td><input type="text" class="inp-flight" value="${item.flight}" placeholder="RF"></td>
            <td><select class="inp-reg">${regOptions}</select></td>
            <td><input type="date" class="inp-date" value="${datePart}"></td>
            <td><input type="time" class="inp-time" value="${timePart}" step="300"></td>
            <td><input type="text" class="inp-city" value="${item.city || ''}"></td>
            <td><button class="btn-delete-row">삭제</button></td>
        `;

        tr.querySelector('.inp-type').addEventListener('change', function() { this.className = 'inp-type ' + (this.value === 'ARR' ? 'type-arr' : 'type-dep'); });
        tr.querySelector('.btn-delete-row').addEventListener('click', () => { if(confirm('이 스케줄을 삭제하시겠습니까?')) tr.remove(); });
        tbody.appendChild(tr);
    });
}

export function addNewTableRow() {
    const tbody = document.querySelector('#scheduleTable tbody');
    const tr = document.createElement('tr');
    
    const uniqueId = `table_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    tr.dataset.id = uniqueId;
    
    let regOptions = `<option value="UNKNOWN">미정</option>`;
    CONFIG.AIRCRAFT_REGS.forEach(r => { regOptions += `<option value="${r}">${r}</option>`; });
    
    const filterStart = document.getElementById('filterStartDate').value;
    let dateStr = filterStart;
    const now = new Date();
    if (!dateStr) {
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        dateStr = `${yyyy}-${mm}-${dd}`;
    }
    
    let min = Math.round(now.getMinutes() / 5) * 5;
    let currHNum = now.getHours();
    if (min >= 60) { min = 0; currHNum = (currHNum + 1) % 24; }
    const currH = String(currHNum).padStart(2, '0');
    const currM = String(min).padStart(2, '0');
    
    tr.classList.add('group-color-a', 'group-start'); 
    tr.innerHTML = `
        <td>
            <select class="inp-type type-arr">
                <option value="ARR">ARR</option>
                <option value="DEP">DEP</option>
            </select>
        </td>
        <td><input type="text" class="inp-flight" value="RF"></td>
        <td><select class="inp-reg">${regOptions}</select></td>
        <td><input type="date" class="inp-date" value="${dateStr}"></td>
        <td><input type="time" class="inp-time" value="${currH}:${currM}" step="300"></td>
        <td><input type="text" class="inp-city" placeholder="CJJ"></td>
        <td><button class="btn-delete-row">삭제</button></td>
    `;
    
    tr.querySelector('.inp-type').addEventListener('change', function() { this.className = 'inp-type ' + (this.value === 'ARR' ? 'type-arr' : 'type-dep'); });
    tr.querySelector('.btn-delete-row').addEventListener('click', () => tr.remove());
    
    tbody.prepend(tr); 
    tr.querySelector('.inp-flight').focus();
}

export function saveScheduleTable() {
    const rows = document.querySelectorAll('#scheduleTable tbody tr');
    const existingIds = itemsDataSet.getIds();
    const currentTableIds = [];
    const updates = [], adds =[];
    let hasError = false;

    rows.forEach(row => {
        if (hasError) return;
        const id = row.dataset.id;
        currentTableIds.push(id);
        
        const type = row.querySelector('.inp-type').value;
        let flight = row.querySelector('.inp-flight').value.trim();
        const reg = row.querySelector('.inp-reg').value;
        const datePart = row.querySelector('.inp-date').value;
        const timePart = row.querySelector('.inp-time').value;
        const city = row.querySelector('.inp-city').value;
        
        if (!flight || flight === 'RF') { alert("편명(Flight)을 정확히 입력해 주세요."); hasError = true; return; }
        if (/^\d+$/.test(flight)) flight = 'RF' + flight; 
        else flight = flight.toUpperCase();
        if (!datePart || !timePart) return; 
        
        const timeStr = `${datePart}T${timePart}:00+09:00`;
        const contentStr = `${reg !== 'UNKNOWN' ? reg : ''} ${flight}`.trim();

        if (existingIds.includes(id)) {
            const item = itemsDataSet.get(id);
            const isMod = (item.start !== timeStr || item.rawStand !== item.originalRawStand);
            updates.push({
                id: id, flightType: type, flight: flight, reg: reg, city: city,
                originalStart: timeStr, content: contentStr, baseContent: contentStr, isModified: isMod
            });
        } else {
            adds.push({
                id: id, type: 'point', isOther: false, flightType: type, flight: flight,
                reg: reg, rawStand: '미정', group: '미정', start: timeStr, originalStart: timeStr,
                originalRawStand: '미정', city: city, content: contentStr, baseContent: contentStr,
                isModified: false, towOffset: 30, isActive: true, pairId: null
            });
            if (!groupsDataSet.get('미정')) groupsDataSet.add({ id: '미정', content: '미정 (배정필요)', order: 9999 });
        }
    });

    if (hasError) return;

    const toDelete = existingIds.filter(id => {
        const item = itemsDataSet.get(id);
        return !currentTableIds.includes(id) && !item.isLink && !item.isOther && item.isActive !== false;
    });

    if(toDelete.length > 0) itemsDataSet.remove(toDelete);
    if(updates.length > 0) itemsDataSet.update(updates);
    if(adds.length > 0) itemsDataSet.add(adds);

    updateItemClasses(); evaluateConnections(); renderScheduleTable();
    alert("기준 스케줄 갱신 완료!");
}

export function initScheduleTab() {
    document.getElementById('btnTableSave').addEventListener('click', saveScheduleTable);
    document.getElementById('btnTableAddRow').addEventListener('click', addNewTableRow);
    document.getElementById('selSortTable').addEventListener('change', renderScheduleTable);
    document.getElementById('filterStartDate').addEventListener('change', renderScheduleTable);
    document.getElementById('filterEndDate').addEventListener('change', renderScheduleTable);
    document.getElementById('btnFilterClear').addEventListener('click', () => {
        document.getElementById('filterStartDate').value = '';
        document.getElementById('filterEndDate').value = '';
        renderScheduleTable();
    });
}