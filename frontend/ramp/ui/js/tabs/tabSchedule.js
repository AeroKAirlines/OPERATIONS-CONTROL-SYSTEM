import { CONFIG } from '../core/config.js';
import { fetchWithAuth } from '../services/api.js'; // 🌟 인증 통신 추가

let adminData = [];

const extractTime = (timeStr) => {
    if (!timeStr) return "";
    if (timeStr.includes('T')) return timeStr.split('T')[1].substring(0, 5);
    if (timeStr.includes(' ')) return timeStr.split(' ')[1].substring(0, 5);
    return timeStr;
};

export async function loadAdminSchedules() {
    const startD = document.getElementById('adminStartDate').value;
    const endD = document.getElementById('adminEndDate').value;

    if (!startD || !endD) return alert("조회할 시작일과 종료일을 선택하세요.");
    if (startD > endD) return alert("종료일이 시작일보다 빠를 수 없습니다.");

    document.getElementById('pdfTableContainer').innerHTML = '<div style="padding:20px;">데이터를 불러오는 중입니다...</div>';
    document.getElementById('aarTableContainer').innerHTML = '<div style="padding:20px;">데이터를 불러오는 중입니다...</div>';

    try {
        // 🌟 fetchWithAuth 적용
        const res = await fetchWithAuth(`/ramp/api/admin/schedules?start_date=${startD}&end_date=${endD}`);
        const result = await res.json();

        if (result.status === 'success') {
            adminData = result.data;
            renderPdfAdmin();
            renderAarAdmin();
        }
    } catch (e) {
        alert("서버 통신 오류가 발생했습니다.");
    }
}

export function renderPdfAdmin() {
    const container = document.getElementById('pdfTableContainer');
    if (!adminData.length) return container.innerHTML = '<div style="padding:20px;">해당 기간에 데이터가 없습니다.</div>';

    const sortType = document.getElementById('selSortPdf').value;
    const isSplit = document.getElementById('chkSplitPdf').checked;

    let sortedData = [...adminData].sort((a, b) => {
        if (sortType === 'flight') {
            if (a.flight_number !== b.flight_number) return a.flight_number.localeCompare(b.flight_number);
            return a.base_time.localeCompare(b.base_time);
        }
        return a.base_time.localeCompare(b.base_time);
    });

    if (isSplit) {
        const arrData = sortedData.filter(d => d.flight_type === 'ARR');
        const depData = sortedData.filter(d => d.flight_type === 'DEP');
        container.innerHTML = `
            <div class="split-container">
                <div class="split-half">
                    <div class="admin-table-title arr">⬇️ 도착 (ARR)</div>
                    <div style="overflow-y:auto; max-height:600px;">${buildPdfTable(arrData)}</div>
                </div>
                <div class="split-half">
                    <div class="admin-table-title dep">⬆️ 출발 (DEP)</div>
                    <div style="overflow-y:auto; max-height:600px;">${buildPdfTable(depData)}</div>
                </div>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="split-half">
                <div class="admin-table-title all">↕️ 도착 및 출발 (통합)</div>
                <div style="overflow-y:auto; max-height:600px;">${buildPdfTable(sortedData)}</div>
            </div>`;
    }
    attachPdfEvents();
}

function buildPdfTable(data) {
    let html = `<table class="admin-table"><thead><tr><th width="70">날짜</th><th width="70">편명</th><th width="40">구분</th><th>시간 (STD/STA)</th><th>주기장</th><th width="40">삭제</th></tr></thead><tbody>`;
    data.forEach(item => {
        html += `<tr data-id="${item.id}" data-date="${item.flight_date}">
            <td class="bold">${item.flight_date.substring(5)}</td>
            <td class="bold color-navy">${item.flight_number}</td>
            <td><span style="font-size:10px; font-weight:bold; color:${item.flight_type === 'ARR' ? '#0369a1' : '#a16207'};">${item.flight_type}</span></td>
            <td><input type="time" class="inp-time modern-input-sm" value="${extractTime(item.base_time)}" style="width:90%;"></td>
            <td><input type="text" class="inp-stand modern-input-sm" value="${item.base_stand}" style="width:90%;"></td>
            <td><button class="btn-del-mini" title="삭제">✖</button></td>
        </tr>`;
    });
    return html + `</tbody></table>`;
}

export function renderAarAdmin() {
    const container = document.getElementById('aarTableContainer');
    const rfData = adminData.filter(d => String(d.flight_number).startsWith('RF'));
    if (!rfData.length) return container.innerHTML = '<div style="padding:20px;">해당 기간에 자사(Aero K) 데이터가 없습니다.</div>';

    const sortType = document.getElementById('selSortAar').value;
    const isSplit = document.getElementById('chkSplitAar').checked;

    let sortedData = [...rfData].sort((a, b) => {
        if (sortType === 'reg') {
            const regA = a.aar_reg || 'UNKNOWN'; const regB = b.aar_reg || 'UNKNOWN';
            if (regA !== regB) return regA.localeCompare(regB);
            return a.aar_time.localeCompare(b.aar_time);
        }
        return a.aar_time.localeCompare(b.aar_time);
    });

    if (isSplit) {
        const arrData = sortedData.filter(d => d.flight_type === 'ARR');
        const depData = sortedData.filter(d => d.flight_type === 'DEP');
        container.innerHTML = `
            <div class="split-container">
                <div class="split-half">
                    <div class="admin-table-title arr">⬇️ 도착 (ARR)</div>
                    <div style="overflow-y:auto; max-height:600px;">${buildAarTable(arrData)}</div>
                </div>
                <div class="split-half">
                    <div class="admin-table-title dep">⬆️ 출발 (DEP)</div>
                    <div style="overflow-y:auto; max-height:600px;">${buildAarTable(depData)}</div>
                </div>
            </div>`;
    } else {
        container.innerHTML = `
            <div class="split-half">
                <div class="admin-table-title all">↕️ 도착 및 출발 (통합)</div>
                <div style="overflow-y:auto; max-height:600px;">${buildAarTable(sortedData)}</div>
            </div>`;
    }
    attachAarEvents();
}

function buildAarTable(data) {
    let html = `<table class="admin-table"><thead><tr><th width="70">날짜</th><th width="70">편명</th><th width="40">구분</th><th>시간 (ETD/ETA)</th><th width="100">기번 (REG)</th><th width="40">삭제</th></tr></thead><tbody>`;
    data.forEach(item => {
        let regOptions = `<option value="UNKNOWN">미정</option>`;
        const allRegs = new Set(CONFIG.AIRCRAFT_REGS);
        if (item.aar_reg && item.aar_reg !== 'UNKNOWN') allRegs.add(item.aar_reg);
        Array.from(allRegs).sort().forEach(r => {
            regOptions += `<option value="${r}" ${item.aar_reg === r ? 'selected' : ''}>${r}</option>`;
        });

        html += `<tr data-id="${item.id}" data-date="${item.flight_date}">
            <td class="bold">${item.flight_date.substring(5)}</td>
            <td class="bold color-orange">${item.flight_number}</td>
            <td><span style="font-size:10px; font-weight:bold; color:${item.flight_type === 'ARR' ? '#0369a1' : '#a16207'};">${item.flight_type}</span></td>
            <td><input type="time" class="inp-time modern-input-sm" value="${extractTime(item.aar_time)}" style="width:90%;"></td>
            <td><select class="inp-reg modern-select" style="padding:4px; width:100%; font-size:12px;">${regOptions}</select></td>
            <td><button class="btn-del-mini" title="삭제">✖</button></td>
        </tr>`;
    });
    return html + `</tbody></table>`;
}

function attachPdfEvents() {
    document.querySelectorAll('#pdfTableContainer input').forEach(inp => {
        inp.addEventListener('change', (e) => e.target.closest('tr').classList.add('row-modified'));
    });
    attachDeleteEvents('#pdfTableContainer');
}

function attachAarEvents() {
    document.querySelectorAll('#aarTableContainer input, #aarTableContainer select').forEach(inp => {
        inp.addEventListener('change', (e) => e.target.closest('tr').classList.add('row-modified'));
    });
    attachDeleteEvents('#aarTableContainer');
}

function attachDeleteEvents(containerSelector) {
    document.querySelectorAll(`${containerSelector} .btn-del-mini`).forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!confirm("DB에서 완전히 삭제하시겠습니까? (복구 불가)")) return;
            const tr = e.target.closest('tr');
            try {
                // 🌟 fetchWithAuth 적용
                const res = await fetchWithAuth(`/ramp/api/admin/delete/${tr.dataset.id}`, { method: 'DELETE' });
                const result = await res.json();
                if (result.status === 'success') {
                    tr.remove();
                    adminData = adminData.filter(d => d.id !== tr.dataset.id);
                }
            } catch (err) { alert("삭제 실패"); }
        });
    });
}

export function initScheduleTab() {
    const today = new Date();
    const format = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const startInput = document.getElementById('adminStartDate');
    if (startInput) {
        startInput.value = format(today);
        document.getElementById('adminEndDate').value = format(today);
        document.getElementById('btnAdminQuery').addEventListener('click', loadAdminSchedules);
    }

    document.getElementById('chkSplitPdf').addEventListener('change', renderPdfAdmin);
    document.getElementById('selSortPdf').addEventListener('change', renderPdfAdmin);
    document.getElementById('chkSplitAar').addEventListener('change', renderAarAdmin);
    document.getElementById('selSortAar').addEventListener('change', renderAarAdmin);

    const btnSavePdf = document.getElementById('btnSavePdfAll');
    if (btnSavePdf) {
        btnSavePdf.addEventListener('click', async () => {
            const modifiedRows = document.querySelectorAll('#pdfTableContainer tr.row-modified');
            if (modifiedRows.length === 0) return alert("수정된 항목이 없습니다.");

            const updates = Array.from(modifiedRows).map(tr => ({
                id: tr.dataset.id,
                base_time: tr.querySelector('.inp-time').value ? `${tr.dataset.date} ${tr.querySelector('.inp-time').value}` : "",
                base_stand: tr.querySelector('.inp-stand').value
            }));

            btnSavePdf.textContent = "저장 중...";
            try {
                // 🌟 fetchWithAuth 적용
                const res = await fetchWithAuth('/ramp/api/admin/update_pdf_bulk', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert(result.message);
                    modifiedRows.forEach(tr => tr.classList.remove('row-modified'));
                } else alert("저장 실패: " + result.message);
            } catch (err) { alert("서버 통신 오류"); }
            btnSavePdf.textContent = "💾 변경사항 일괄 저장";
        });
    }

    const btnSaveAar = document.getElementById('btnSaveAarAll');
    if (btnSaveAar) {
        btnSaveAar.addEventListener('click', async () => {
            const modifiedRows = document.querySelectorAll('#aarTableContainer tr.row-modified');
            if (modifiedRows.length === 0) return alert("수정된 항목이 없습니다.");

            const updates = Array.from(modifiedRows).map(tr => ({
                id: tr.dataset.id,
                aar_time: tr.querySelector('.inp-time').value ? `${tr.dataset.date} ${tr.querySelector('.inp-time').value}` : "",
                aar_reg: tr.querySelector('.inp-reg').value
            }));

            btnSaveAar.textContent = "저장 중...";
            try {
                // 🌟 fetchWithAuth 적용
                const res = await fetchWithAuth('/ramp/api/admin/update_aar_bulk', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                const result = await res.json();
                if (result.status === 'success') {
                    alert(result.message);
                    modifiedRows.forEach(tr => tr.classList.remove('row-modified'));
                } else alert("저장 실패: " + result.message);
            } catch (err) { alert("서버 통신 오류"); }
            btnSaveAar.textContent = "💾 변경사항 일괄 저장";
        });
    }
}