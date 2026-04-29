import { CONFIG } from '../core/config.js';
import { itemsDataSet, groupsDataSet, state } from '../core/store.js';
import { evaluateConnections, updateItemClasses } from '../chart.js';
import { formatFlight } from '../core/utils.js';

export function updateStandDropdowns(forceStand1 = null, forceStand2 = null) {
    const chk = document.getElementById('chkShowRareStands');
    const showRare = chk ? chk.checked : false;
    const rareStands =['1', '12', '12R', '13', '13L', '13R'];
    const standSelectIds =['editStand1', 'editStand2'];

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
    const arr = new Date(arrTime).getTime();
    const dep = new Date(depTime).getTime();
    if(dep <= arr) return "에러";
    const diffMin = Math.floor((dep - arr) / 60000);
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function createPairCardHTML(itemData, title, align = 'left') {
    if (!itemData) return '';
    const isUTC = document.getElementById('chkUTC').checked;
    const d = new Date(itemData.start);
    const hStr = String(isUTC ? d.getUTCHours() : d.getHours()).padStart(2, '0');
    const mStr = String(isUTC ? d.getUTCMinutes() : d.getMinutes()).padStart(2, '0');
    const timeFmt = `${hStr}:${mStr}${isUTC ? 'Z' : 'L'}`;
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
    
    if (item.isActive === false) {
        document.getElementById('editPanelActive').style.display = 'none';
        document.getElementById('editPanelInactive').style.display = 'block';
        document.getElementById('inactiveLabel').textContent = `선택됨: [미배정] ${item.flight} (${item.flightType === 'ARR' ? '도착' : '출발'})`;
        document.getElementById('editPanelContainer').style.display = 'block';
        return;
    }

    document.getElementById('editPanelInactive').style.display = 'none';
    document.getElementById('editPanelActive').style.display = 'block';

    const origInfoSpan = document.getElementById('editOriginalInfo');
    if (item.isModified && item.originalStart) {
        const origD = new Date(item.originalStart);
        const origM = String(origD.getMonth() + 1).padStart(2, '0');
        const origDay = String(origD.getDate()).padStart(2, '0');
        const origH = String(origD.getHours()).padStart(2, '0');
        const origMin = String(origD.getMinutes()).padStart(2, '0');
        
        let html = `<div class="mod-header"><span style="font-size:14px;">ℹ️</span> PDF 원본(초기) 배정 데이터</div>`;
        html += `<div class="mod-body">`;
        html += `<div class="mod-badge ${item.rawStand !== item.originalRawStand ? 'mod-stand' : ''}"><span>원본 주기장</span><strong>${item.originalRawStand}</strong></div>`;
        html += `<div class="mod-badge ${item.start !== item.originalStart ? 'mod-time' : ''}"><span>원본 시간</span><strong>${origM}/${origDay} ${origH}:${origMin}</strong></div>`;
        html += `</div>`;
        origInfoSpan.innerHTML = html;
        origInfoSpan.style.display = 'block';
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
        html += `
            <div class="pair-divider">
                <div class="divider-line"></div>
                <div class="tat-badge">TAT ${calculateTAT(arrItem.start, depItem.start)}</div>
            </div>
        `;
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
        if(rawStr === '미정') document.getElementById('editStand1').selectedIndex = 0;
        else document.getElementById('editStand1').value = rawStr;
        document.getElementById('editStand2').style.display = 'none';
        document.getElementById('editTowOffsetWrap').style.display = 'none';
    }
    
    document.getElementById('editTowOffset').value = item.towOffset || 30;
    
    const parts = item.start.split('T');
    document.getElementById('editDate').value = parts[0];
    const timeParts = parts[1].split(':');
    
    let min = parseInt(timeParts[1]);
    min = Math.round(min / 5) * 5;
    let hNum = parseInt(timeParts[0]);
    if (min >= 60) { min = 0; hNum = (hNum + 1) % 24; }
    document.getElementById('editHour').value = String(hNum).padStart(2, '0');
    document.getElementById('editMin').value = String(min).padStart(2, '0');

    document.getElementById('editPanelContainer').style.display = 'block';
}

export function closeEditPanel() {
    document.getElementById('editPanelContainer').style.display = 'none';
    state.currentSelectedId = null;
}

export function initEditPanel() {
    // Dropdown Setups
    ['editHour'].forEach(id => {
        const el = document.getElementById(id);
        for(let i=0; i<24; i++) el.innerHTML += `<option value="${i.toString().padStart(2, '0')}">${i.toString().padStart(2, '0')}</option>`;
    });
    
    ['editMin'].forEach(id => {
        const el = document.getElementById(id);
        for(let i=0; i<60; i+=5) el.innerHTML += `<option value="${i.toString().padStart(2, '0')}">${i.toString().padStart(2, '0')}</option>`;
    });

    const regSelect = document.getElementById('inactiveRegSelect');
    if (regSelect) {
        CONFIG.AIRCRAFT_REGS.forEach(reg => {
            const opt = document.createElement('option');
            opt.value = reg;
            opt.textContent = reg;
            regSelect.appendChild(opt);
        });
    }

    document.getElementById('editIsTow').addEventListener('change', function() {
        document.getElementById('editStand2').style.display = this.checked ? 'inline-block' : 'none';
        document.getElementById('editTowOffsetWrap').style.display = this.checked ? 'inline-block' : 'none';
    });

    // Action Buttons
    document.getElementById('btnSaveEdit').addEventListener('click', () => {
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
        if(!d) return alert("날짜를 확인해주세요.");
        
        const newLiveTimeStr = `${d}T${h}:${m}:00+09:00`;
        const isMod = (newLiveTimeStr !== item.originalStart || finalStand !== item.originalRawStand);

        itemsDataSet.update({ 
            id: state.currentSelectedId, group: groupStand, rawStand: finalStand, 
            start: newLiveTimeStr, towOffset: offsetVal, isModified: isMod
        });
        
        setTimeout(() => {
            const hasUnknown = itemsDataSet.get({filter: i => i.group === '미정'}).length > 0;
            if (!hasUnknown && groupsDataSet.get('미정')) groupsDataSet.remove('미정');
        }, 100);

        updateItemClasses(); evaluateConnections(); closeEditPanel();
    });

    document.getElementById('btnDeleteEdit').addEventListener('click', () => {
        if (!state.currentSelectedId) return;
        if(confirm("정말로 이 스케줄을 차트에서 삭제하시겠습니까?")) {
            itemsDataSet.remove(state.currentSelectedId);
            state.currentHighlightedReg = null; state.currentHighlightedPairs = [];
            updateItemClasses(); evaluateConnections(); closeEditPanel();
        }
    });

    document.getElementById('btnActivateFlight').addEventListener('click', () => {
        if(!state.currentSelectedId) return;
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
        if(!state.currentSelectedId) return;
        if(confirm("이 스케줄을 비활성화(미배정 상태) 처리하시겠습니까?\n스케줄 관리, 기번 차트, 배정표에서 숨겨집니다.")) {
            const item = itemsDataSet.get(state.currentSelectedId);
            itemsDataSet.update({
                id: state.currentSelectedId, isActive: false, reg: 'UNKNOWN',
                content: `[미배정] ${item.flight}`, baseContent: `${item.flight}`
            });
            state.currentHighlightedReg = null; state.currentHighlightedPairs = [];
            updateItemClasses(); evaluateConnections(); closeEditPanel();
        }
    });

    document.querySelectorAll('.btnCancelEditGlobal').forEach(btn => btn.addEventListener('click', closeEditPanel));
}