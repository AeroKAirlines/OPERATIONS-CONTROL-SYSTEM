import { itemsDataSet } from '../core/store.js';
import { formatFlight } from '../core/utils.js';

let currentMsgItems = [];

export function renderMessageTable() {
    const tbody = document.querySelector('#msgTable tbody');
    tbody.innerHTML = '';
    currentMsgItems = [];

    const allRF = itemsDataSet.get({
        filter: i => !i.isOther && i.isActive !== false && !i.isLink && i.flight.startsWith('RF')
    });

    const processed = new Set();
    allRF.sort((a, b) => new Date(a.start) - new Date(b.start));

    allRF.forEach(item => {
        if (processed.has(item.id)) return;

        let arrItem = null, depItem = null;
        if (item.flightType === 'ARR') {
            arrItem = item;
            if (item.pairId) { depItem = itemsDataSet.get(item.pairId); if(depItem) processed.add(depItem.id); }
        } else {
            depItem = item;
            if (item.pairId) { arrItem = itemsDataSet.get(item.pairId); if(arrItem) processed.add(arrItem.id); }
        }
        processed.add(item.id);

        let isStandChanged = false, isTimeChanged = false;

        const checkChange = (itm) => {
            if (!itm) return;
            if (itm.rawStand !== itm.originalRawStand) isStandChanged = true;
            const timeDiff = Math.abs(new Date(itm.start) - new Date(itm.originalStart)) / 60000;
            if (timeDiff >= 15) isTimeChanged = true;
        };

        checkChange(arrItem); checkChange(depItem);
        if (!isStandChanged && !isTimeChanged) return;

        let type = isStandChanged ? '변경' : '유지';
        let flightStr = '', standStr = '', timeStr = '';
        const isReqCompleted = (arrItem && arrItem.isReqCompleted) || (depItem && depItem.isReqCompleted);

        const formatTime = (iso) => {
            const d = new Date(iso);
            return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}L`;
        };

        if (arrItem && depItem) {
            flightStr = `${formatFlight(arrItem.flight)}/${formatFlight(depItem.flight).replace('RF', '')}`;
            standStr = depItem.group !== arrItem.group ? `${arrItem.group}➔${depItem.group}` : depItem.group;
            timeStr = `ETA ${formatTime(arrItem.start)} / ETD ${formatTime(depItem.start)}`;
        } 
        else if (arrItem) {
            flightStr = formatFlight(arrItem.flight); standStr = arrItem.group;
            const nextFlt = allRF.find(i => i.reg === arrItem.reg && new Date(i.start) > new Date(arrItem.start));
            let layoverText = "LAYOVER";
            if (nextFlt && nextFlt.flightType === 'DEP') layoverText = `LAYOVER ${formatFlight(nextFlt.flight)}`;
            timeStr = `ETA ${formatTime(arrItem.start)} / ${layoverText}`;
        } 
        else if (depItem) {
            flightStr = formatFlight(depItem.flight); standStr = depItem.group; timeStr = `ETD ${formatTime(depItem.start)}`;
        }

        const rawText = `${flightStr} #${standStr} (${timeStr.replace(/ \/ /g, '/')})`;
        currentMsgItems.push({ 
            id: `msg_${arrItem ? arrItem.id : ''}_${depItem ? depItem.id : ''}`,
            arrId: arrItem ? arrItem.id : null, depId: depItem ? depItem.id : null,
            type, flightStr, standStr, timeStr, rawText, isReqCompleted 
        });
    });

    // 🌟 신청 전 / 신청 완료 분리 렌더링
    const pending = currentMsgItems.filter(i => !i.isReqCompleted);
    const completed = currentMsgItems.filter(i => i.isReqCompleted);

    const renderRow = (msgObj, isDone) => {
        const tr = document.createElement('tr');
        if (isDone) tr.className = 'msg-completed-row';
        const badgeClass = msgObj.type === '변경' ? 'bg-orange' : 'bg-navy';
        
        tr.innerHTML = `
            <td>${isDone ? `<button class="btn-cancel btn-sm btn-restore" data-id="${msgObj.id}">복구</button>` : `<input type="checkbox" class="chk-msg-item" data-id="${msgObj.id}" checked>`}</td>
            <td class="${isDone ? 'strike' : ''}"><span class="stand-badge ${badgeClass}" style="font-size:12px; padding:3px 6px;">${msgObj.type}</span></td>
            <td class="bold ${isDone ? 'strike' : ''}">${msgObj.flightStr}</td>
            <td class="color-purple bold ${isDone ? 'strike' : ''}">${msgObj.standStr}</td>
            <td class="${isDone ? 'strike' : ''}" style="text-align:left; padding-left:15px;">${msgObj.timeStr}</td>
        `;

        if (!isDone) {
            tr.addEventListener('click', (e) => {
                if(e.target.tagName !== 'INPUT') { const chk = tr.querySelector('.chk-msg-item'); chk.checked = !chk.checked; }
            });
        } else {
            tr.querySelector('.btn-restore').addEventListener('click', () => {
                const updates = [];
                if (msgObj.arrId) updates.push({ id: msgObj.arrId, isReqCompleted: false });
                if (msgObj.depId) updates.push({ id: msgObj.depId, isReqCompleted: false });
                itemsDataSet.update(updates);
                renderMessageTable();
            });
        }
        tbody.appendChild(tr);
    };

    pending.forEach(obj => renderRow(obj, false));

    if (completed.length > 0) {
        const divider = document.createElement('tr');
        divider.innerHTML = `<td colspan="5" style="background:#e9ecef; font-weight:bold; color:#6c757d; padding:10px;">⬇ 처리 완료된 스케줄 ⬇</td>`;
        tbody.appendChild(divider);
        completed.forEach(obj => renderRow(obj, true));
    }

    if (currentMsgItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; color:#6c757d;">현재 15분 이상 시간이 변동되거나 주기장이 변경된 스케줄이 없습니다.</td></tr>`;
    }
}

export function generateMessage() {
    const checkboxes = document.querySelectorAll('.chk-msg-item:checked');
    if (checkboxes.length === 0) return alert("메시지를 생성할 스케줄을 하나 이상 선택해주세요.");

    const selectedIds = Array.from(checkboxes).map(chk => chk.dataset.id);
    const selectedItems = currentMsgItems.filter(item => selectedIds.includes(item.id));

    const modItems = selectedItems.filter(i => i.type === '변경');
    const keepItems = selectedItems.filter(i => i.type === '유지');

    let finalText = "";
    if (modItems.length > 0) {
        finalText += "[RF 주기장 변경 신청]\n\n";
        modItems.forEach(item => finalText += `${item.rawText}\n`);
        finalText += "\n확인 부탁드립니다. 감사합니다.\n";
    }

    if (modItems.length > 0 && keepItems.length > 0) finalText += "\n---\n\n";

    if (keepItems.length > 0) {
        finalText += "[RF 주기장 유지 신청]\n\n";
        keepItems.forEach(item => finalText += `${item.rawText}\n`);
        finalText += "\n확인 부탁드립니다. 감사합니다.\n";
    }

    const outputEl = document.getElementById('msgOutput');
    outputEl.value = finalText;
    outputEl.select(); document.execCommand('copy');
    alert("메시지가 생성되었으며 클립보드에 자동 복사되었습니다!");
}

export function initMessageTab() {
    document.getElementById('btnGenerateMsg').addEventListener('click', generateMessage);
    document.getElementById('chkMsgAll').addEventListener('change', function() {
        const isChecked = this.checked;
        document.querySelectorAll('.chk-msg-item').forEach(chk => chk.checked = isChecked);
    });
}