import { CONFIG } from '../core/config.js';
import { itemsDataSet, groupsDataSet, state } from '../core/store.js';
import { evaluateConnections, updateItemClasses } from '../chart.js';
import { formatFlight } from '../core/utils.js';
import { fetchWithAuth } from '../services/api.js'; // 🌟 인증 통신 추가

export function updateStandDropdowns(forceStand1 = null, forceStand2 = null) {
    const chk = document.getElementById('chkShowRareStands');
    const showRare = chk ? chk.checked : false;
    const rareStands = ['1', '12', '12R', '13', '13L', '13R'];
    const standSelectIds = ['editStand1', 'editStand2'];

    standSelectIds.forEach((id, idx) => {
        const select = document.getElementById(id);
        if (!select) return;

        const currentVal = select.value;
        const forceStand = idx === 0 ? forceStand1 : forceStand2;
        select.innerHTML = '';

        CONFIG.STANDS.forEach(stand => {
            if (!showRare && rareStands.includes(stand) && stand !== forceStand) return;
            const opt = document.createElement('option');
            opt.value = stand;
            opt.textContent = stand;
            select.appendChild(opt);
        });

        if (forceStand) select.value = forceStand;
        else if (Array.from(select.options).some(opt => opt.value === currentVal)) select.value = currentVal;
    });
}

function calculateTAT(arrTime, depTime) {
    if (!arrTime || !depTime) return "-";
    const arr = new Date(arrTime.replace(' ', 'T')).getTime();
    const dep = new Date(depTime.replace(' ', 'T')).getTime();
    if (dep <= arr) return "에러";
    const diffMin = Math.floor((dep - arr) / 60000);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function createPairCardHTML(itemData, title, align = 'left') {
    if (!itemData) return '';
    const safeTimeStr = itemData.start.replace(' ', 'T');
    const d = new Date(safeTimeStr);
    const hStr = String(d.getHours()).padStart(2, '0');
    const mStr = String(d.getMinutes()).padStart(2, '0');
    const timeFmt = `${hStr}:${mStr}L`;
    const typeLabel = itemData.flightType === 'ARR' ? '도착' : '출발';
    const cityText = itemData.city || 'CJJ';
    const isArr = itemData.flightType === 'ARR';

    const titleColor = isArr ? 'color-navy' : 'color-orange';
    const standBg = isArr ? 'bg-navy' : 'bg-orange';
    const alignClass = align === 'right' ? 'align-right' : (align === 'center' ? 'align-center' : 'align-left');

    return `
        <div class="pair-item ${alignClass}">
            <div class="pair-type ${titleColor}">${title} (${typeLabel})</div>
            <div class="pair-main">
                <span class="pair-stand ${standBg}">${itemData.group || '미정'}</span>
                <span class="pair-flight">${formatFlight(itemData.flight)}</span>
            </div>
            <div class="pair-time">${cityText} / ${timeFmt}</div>
        </div>
    `;
}

export function openEditPanel(itemId) {
    state.currentSelectedId = itemId;
    const item = itemsDataSet.get(itemId);

    document.getElementById('editPanelEmpty').style.display = 'none';
    document.getElementById('editPanelContent').style.display = 'block';

    if (item.isActive === false) {
        document.getElementById('editPanelActive').style.display = 'none';
        document.getElementById('editPanelInactive').style.display = 'block';
        document.getElementById('inactiveLabel').textContent = `선택됨: [미배정] ${item.flight} (${item.flightType === 'ARR' ? '도착' : '출발'})`;
        return;
    }

    document.getElementById('editPanelInactive').style.display = 'none';
    document.getElementById('editPanelActive').style.display = 'block';

    const origInfoSpan = document.getElementById('editOriginalInfo');
    if (item.isModified && item.originalStart) {
        try {
            const origD = new Date(item.originalStart.replace(' ', 'T'));
            const origM = String(origD.getMonth() + 1).padStart(2, '0');
            const origDay = String(origD.getDate()).padStart(2, '0');
            const origH = String(origD.getHours()).padStart(2, '0');
            const origMin = String(origD.getMinutes()).padStart(2, '0');

            let html = `<div class="mod-header" style="margin-bottom: 5px; color:#dc3545; font-size:12px; font-weight:bold; justify-content:center; gap:3px;"><span style="font-size:12px;">ℹ️</span>초기 배정</div>`;
            html += `<div class="mod-body" style="display: flex; flex-direction: column; gap: 4px;">`;
            html += `<div class="mod-badge ${item.rawStand !== item.originalRawStand ? 'mod-stand' : ''}" style="justify-content: space-between; padding: 4px 8px; border-radius: 4px;"><span>주기장</span><strong style="font-size:13px;">${item.originalRawStand}</strong></div>`;
            html += `<div class="mod-badge ${item.start !== item.originalStart ? 'mod-time' : ''}" style="justify-content: space-between; padding: 4px 8px; border-radius: 4px;"><span>시간</span><strong style="font-size:13px;">${origH}:${origMin}</strong></div>`;
            html += `</div>`;
            origInfoSpan.innerHTML = html;
            origInfoSpan.style.display = 'flex'; // Changed to flex for the container styles in index.html
        } catch (e) { origInfoSpan.style.display = 'none'; }
    } else {
        origInfoSpan.style.display = 'none';
    }

    const gridEl = document.getElementById('livePairGrid');
    gridEl.innerHTML = '';

    let html = '';
    if (item.pairId) {
        const pairItem = itemsDataSet.get(item.pairId);
        const arrItem = item.flightType === 'ARR' ? item : pairItem;
        const depItem = item.flightType === 'DEP' ? item : pairItem;

        html += createPairCardHTML(arrItem, arrItem.id === item.id ? '선택된 스케줄' : '연결된 도착편', 'left');
        html += `<div class="pair-divider"><div class="divider-line"></div><div class="tat-badge">TAT ${calculateTAT(arrItem.start, depItem.start)}</div></div>`;
        html += createPairCardHTML(depItem, depItem.id === item.id ? '선택된 스케줄' : '연결된 출발편', 'right');
    } else {
        html += createPairCardHTML(item, '선택된 스케줄 (단독)', 'center');
    }
    gridEl.innerHTML = html;

    let rawStr = String(item.rawStand || item.group || '');
    let stand1ToForce = rawStr.includes('-') ? rawStr.split('-')[0] : (rawStr !== '미정' ? rawStr : null);
    let stand2ToForce = rawStr.includes('-') ? rawStr.split('-')[1] : null;
    updateStandDropdowns(stand1ToForce, stand2ToForce);

    if (rawStr.includes('-')) {
        document.getElementById('editIsTow').checked = true;
        document.getElementById('editStand1').value = rawStr.split('-')[0];
        document.getElementById('editStand2').value = rawStr.split('-')[1];
        document.getElementById('editStand2').style.display = 'inline-block';
        document.getElementById('editTowOffsetWrap').style.display = 'inline-block';
    } else {
        document.getElementById('editIsTow').checked = false;
        if (rawStr === '미정') document.getElementById('editStand1').selectedIndex = 0;
        else document.getElementById('editStand1').value = rawStr;
        document.getElementById('editStand2').style.display = 'none';
        document.getElementById('editTowOffsetWrap').style.display = 'none';
    }

    document.getElementById('editTowOffset').value = item.towOffset || 30;

    try {
        let datePart = "", timePart = "";
        if (item.start.includes('T')) {
            const parts = item.start.split('T');
            datePart = parts[0]; timePart = parts[1].substring(0, 5);
        } else if (item.start.includes(' ')) {
            const parts = item.start.split(' ');
            datePart = parts[0]; timePart = parts[1].substring(0, 5);
        }

        document.getElementById('editDate').value = datePart;
        const timeParts = timePart.split(':');
        let min = parseInt(timeParts[1]) || 0;
        min = Math.round(min / 5) * 5;
        let hNum = parseInt(timeParts[0]) || 0;
        if (min >= 60) { min = 0; hNum = (hNum + 1) % 24; }

        document.getElementById('editHour').value = String(hNum).padStart(2, '0');
        document.getElementById('editMin').value = String(min).padStart(2, '0');
    } catch (e) { }
}

export function closeEditPanel() {
    document.getElementById('editPanelContent').style.display = 'none';
    document.getElementById('editPanelEmpty').style.display = 'flex';
    state.currentSelectedId = null;
    if (window.timeline) window.timeline.setSelection([]);
}

export function initEditPanel() {
    ['editHour'].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        for (let i = 0; i < 24; i++) el.innerHTML += `<option value="${i.toString().padStart(2, '0')}">${i.toString().padStart(2, '0')}</option>`;
    });

    ['editMin'].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = '';
        for (let i = 0; i < 60; i += 5) el.innerHTML += `<option value="${i.toString().padStart(2, '0')}">${i.toString().padStart(2, '0')}</option>`;
    });

    const regSelect = document.getElementById('inactiveRegSelect');
    if (regSelect) {
        regSelect.innerHTML = '';
        CONFIG.AIRCRAFT_REGS.forEach(reg => {
            regSelect.innerHTML += `<option value="${reg}">${reg}</option>`;
        });
    }

    document.getElementById('editIsTow').addEventListener('change', function () {
        document.getElementById('editStand2').style.display = this.checked ? 'inline-block' : 'none';
        document.getElementById('editTowOffsetWrap').style.display = this.checked ? 'inline-block' : 'none';
    });

    document.getElementById('btnSaveEdit').addEventListener('click', async () => {
        if (!state.currentSelectedId) return;
        const item = itemsDataSet.get(state.currentSelectedId);

        let s1 = document.getElementById('editStand1').value;
        let isTow = document.getElementById('editIsTow').checked;
        let s2 = document.getElementById('editStand2').value;
        let offsetVal = parseInt(document.getElementById('editTowOffset').value) || 30;

        let finalStand = isTow ? `${s1}-${s2}` : s1;
        let groupStand = (item.flightType === 'ARR') ? s1 : (isTow ? s2 : s1);

        const d = document.getElementById('editDate').value;
        const h = document.getElementById('editHour').value;
        const m = document.getElementById('editMin').value;
        if (!d) return alert("날짜를 확인해주세요.");

        const newLiveTimeStr = `${d} ${h}:${m}`;
        const isMod = true;

        try {
            const payload = {
                id: state.currentSelectedId,
                manual_time: newLiveTimeStr,
                manual_stand: finalStand,
                manual_reg: item.reg,
                tow_offset: offsetVal
            };

            // 🌟 fetchWithAuth 적용
            const res = await fetchWithAuth('/ramp/api/live/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (result.status === 'success') {
                itemsDataSet.update({
                    id: state.currentSelectedId, group: groupStand, rawStand: finalStand,
                    start: newLiveTimeStr, towOffset: offsetVal, isModified: isMod
                });
                updateItemClasses(); evaluateConnections(); closeEditPanel();
            } else {
                alert("수정 실패: " + result.message);
            }
        } catch (err) { alert("서버 통신 오류가 발생했습니다."); }
    });

    document.getElementById('btnDeleteEdit').addEventListener('click', () => {
        if (!state.currentSelectedId) return;
        if (confirm("차트에서 이 스케줄을 삭제하시겠습니까?")) {
            itemsDataSet.remove(state.currentSelectedId);
            state.currentHighlightedReg = null;
            state.currentHighlightedPairs = [];
            updateItemClasses(); evaluateConnections(); closeEditPanel();
        }
    });

    document.getElementById('btnActivateFlight').addEventListener('click', () => {
        if (!state.currentSelectedId) return;
        const regVal = document.getElementById('inactiveRegSelect').value;
        const item = itemsDataSet.get(state.currentSelectedId);
        itemsDataSet.update({
            id: state.currentSelectedId, isActive: true, reg: regVal,
            content: `${regVal} ${item.flight}`, baseContent: `${regVal} ${item.flight}`
        });
        updateItemClasses(); evaluateConnections(); closeEditPanel();
        alert(`성공적으로 활성화되었습니다.`);
    });

    document.getElementById('btnDeactivateEdit').addEventListener('click', () => {
        if (!state.currentSelectedId) return;
        if (confirm("이 스케줄을 비활성화(미배정 상태) 처리하시겠습니까?\n스케줄 관리, 기번 차트, 배정표에서 숨겨집니다.")) {
            const item = itemsDataSet.get(state.currentSelectedId);
            itemsDataSet.update({
                id: state.currentSelectedId, isActive: false, reg: 'UNKNOWN',
                content: `[미배정] ${item.flight}`, baseContent: `${item.flight}`
            });
            state.currentHighlightedReg = null;
            state.currentHighlightedPairs = [];
            updateItemClasses(); evaluateConnections(); closeEditPanel();
        }
    });

    document.querySelectorAll('.btnCancelEditGlobal').forEach(btn => btn.addEventListener('click', closeEditPanel));
}