let globalFlightsData =[];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('print-date-filter').valueAsDate = new Date();
});

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.querySelectorAll('#main-tabs button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    btnElement.classList.add('active');
}

// 1. AAR 분석
async function parseAAR() {
    const textStr = document.getElementById('aar-input-text').value;
    if(!textStr) { alert("AAR 메일 텍스트를 붙여넣어 주세요."); return; }

    try {
        const response = await fetch('/checklist/api/parse_aar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aar_text: textStr })
        });
        const result = await response.json();
        
        if(result.status === 'success') {
            renderEditTable(result.data);
            document.getElementById('edit-section').style.display = 'block';
            document.getElementById('edit-section').scrollIntoView({ behavior: 'smooth' });
        } else {
            alert("오류 발생: " + (result.message || JSON.stringify(result.detail)));
        }
    } catch (error) { 
        console.error("통신 에러:", error); 
        alert("서버 통신 실패 (콘솔창 확인)"); 
    }
}

// 표 그리기
function renderEditTable(rawData) {
    const tbody = document.getElementById('edit-tbody');
    let html = '';
    rawData.forEach(d => {
        const color = d.is_from_aar ? '#333' : '#d93025';
        html += `
        <tr class="edit-row" data-from-aar="${d.is_from_aar}">
            <input type="hidden" class="e-pair" value="${d.pair_id}">
            <input type="hidden" class="e-num" value="${d.num_only}">
            <input type="hidden" class="e-dep" value="${d.dep}">
            <input type="hidden" class="e-arr" value="${d.arr}">
            <td><input type="text" class="edit-input e-date" value="${d.date_str}" style="width:50px; color:${color};"></td>
            <td><input type="text" class="edit-input e-flt" value="${d.flt_num}" style="width:70px; font-weight:bold; color:${color};"></td>
            <td>${d.dep}</td><td>${d.arr}</td>
            <td><input type="text" class="edit-input e-etd" value="${d.etd_z}" style="width:50px; color:${color};"></td>
            <td><input type="text" class="edit-input e-eta" value="${d.eta_z}" style="width:50px; color:${color};"></td>
            <td><input type="text" class="edit-input e-reg" value="${d.reg}" style="width:60px; color:${color};"></td>
            <td><input type="text" class="edit-input e-cpt" value="${d.cpt}" style="width:100px; color:${color};"></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function formatCpt(name, isTarget) {
    if (!name) return '';
    if (isTarget) {
        return `<span style="color:#d97706; font-weight:bold;">${name}</span>`;
    }
    return name;
}

function renderNightReviewTable(selectedDate) {
    const tbody = document.getElementById('night-review-tbody');
    tbody.innerHTML = '';
    
    if (!selectedDate) {
        tbody.innerHTML = '<tr><td colspan="20" class="empty-state">날짜를 선택해야 야간편 검토가 표시됩니다.</td></tr>';
        return;
    }
    
    let parts = selectedDate.split('-');
    let baseD = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    
    let d1 = new Date(baseD); d1.setDate(d1.getDate() + 1);
    let d2 = new Date(baseD); d2.setDate(d2.getDate() + 2);
    
    let d1Str = `${d1.getFullYear()}-${String(d1.getMonth()+1).padStart(2,'0')}-${String(d1.getDate()).padStart(2,'0')}`;
    let d2Str = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}-${String(d2.getDate()).padStart(2,'0')}`;
    
    const NIGHT_REVIEW_DESTS = ['CRK', 'DAD', 'UBN', 'CEB', 'CXR'];
    
    let targetPairs = new Set();
    globalFlightsData.forEach(f => {
        if (!f.is_domestic && (NIGHT_REVIEW_DESTS.includes(f.arr) || NIGHT_REVIEW_DESTS.includes(f.dep))) {
            if (f.shift_date === d1Str || f.shift_date === d2Str) {
                targetPairs.add(f.pair_id);
            }
        }
    });

    let filteredData = globalFlightsData.filter(f => targetPairs.has(f.pair_id));
    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="20" class="empty-state">해당 기간(D+1 ~ D+2)에 대상 야간편이 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    let i = 0;
    while (i < filteredData.length) {
        let o = filteredData[i];
        let r = (i + 1 < filteredData.length && !filteredData[i+1].is_outbound) ? filteredData[i+1] : null;
        
        if (!r) { i++; continue; }
        
        // date_str doesn't exist, compute from _etd_k_dt or shift_date. We can just use shift_date's MM/DD
        let oDate = o.shift_date.substring(5).replace('-', '/');
        let rDate = r.shift_date.substring(5).replace('-', '/');

        let oExtra = o.tank_type ? `${o.tank_type} / ${o.tank_val}` : '';
        let rExtra = r.tank_type ? `${r.tank_type} / ${r.tank_val}` : '';

        // simplified dow stripping <br>
        let oDow = o.dow ? o.dow.replace('<br>', ' ') : '';
        let rDow = r.dow ? r.dow.replace('<br>', ' ') : '';

        html += `<tr>
            <!-- OUTBOUND -->
            <td style="font-weight:bold;">${oDate}</td>
            <td style="font-weight:bold;">${o.reg}</td>
            <td style="font-weight:bold;">${o.flt_num}</td>
            <td>${o.route}</td>
            <td>${o.etd_z} ~ ${o.eta_z}</td>
            <td style="color:#888;">${o.altn_print || ''}</td>
            <td></td> <!-- PAX -->
            <td></td> <!-- FUEL -->
            <td style="font-weight:bold; color:#d93025;">${oExtra}</td>
            <td style="font-size:10px;">${oDow}</td>

            <!-- INBOUND -->
            <td style="font-weight:bold;">${rDate}</td>
            <td style="font-weight:bold;">${r.reg}</td>
            <td style="font-weight:bold;">${r.flt_num}</td>
            <td>${r.route}</td>
            <td>${r.etd_z} ~ ${r.eta_z}</td>
            <td style="color:#888;">${r.altn_print || ''}</td>
            <td></td> <!-- PAX -->
            <td></td> <!-- FUEL -->
            <td style="font-weight:bold; color:#d93025;">${rExtra}</td>
            <td style="font-size:10px;">${rDow}</td>
        </tr>`;
        
        i += 2;
    }
    tbody.innerHTML = html;
}

// 🌟 필터링 및 화면 출력 (국내선 야간조 ATC 예외, 국제선 왕편-복편 ATC 연계 완벽 반영)
function filterPrintTable() {
    const selectedDate = document.getElementById('print-date-filter').value;
    const shiftFilter = document.getElementById('print-shift-filter').value;
    const titleElement = document.getElementById('print-main-title');
    const is_all_shifts = (shiftFilter === 'all');
    
    // 야간편 검토 표시 로직 (오후 또는 전체일 때)
    if (shiftFilter === 'afternoon' || shiftFilter === 'all') {
        document.getElementById('night-review-section').style.display = 'block';
        renderNightReviewTable(selectedDate);
    } else {
        document.getElementById('night-review-section').style.display = 'none';
    }
    
    let shiftName = shiftFilter === 'morning' ? "오전" : shiftFilter === 'afternoon' ? "오후" : shiftFilter === 'night' ? "야간" : "전체";
    let dateStr = selectedDate ? selectedDate.substring(5).replace('-','/') + " " : "";
    titleElement.innerText = `${dateStr}${shiftName} 비행계획 체크리스트`;

    const tbody = document.getElementById('print-tbody');
    tbody.innerHTML = '';

    if(globalFlightsData.length === 0) return;

    let pairsToPrint = new Set();
    globalFlightsData.forEach(f => {
        let matchDate = (selectedDate === "" || f.shift_date === selectedDate);
        let matchShift = (shiftFilter === 'all' || f.shift_code === shiftFilter);

        // 🌟 [핵심 변경] 야간 근무자는 다음날 아침의 G2(609, 610, 613, 614)를 볼 수 있어야 함!
        let is_night_g2_exception = false;
        if (shiftFilter === 'night' && f.is_domestic &&['609', '610', '613', '614'].includes(f.num_only)) {
            if (selectedDate !== "") {
                // 타임존 오류 방지를 위해 년,월,일을 직접 쪼개서 하루 더함
                let parts = selectedDate.split('-');
                let nextDay = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1);
                let yy = nextDay.getFullYear();
                let mm = String(nextDay.getMonth() + 1).padStart(2, '0');
                let dd = String(nextDay.getDate()).padStart(2, '0');
                if (f.shift_date === `${yy}-${mm}-${dd}`) is_night_g2_exception = true;
            } else {
                is_night_g2_exception = true;
            }
        }

        if ((matchDate && matchShift) || is_night_g2_exception) {
            pairsToPrint.add(f.pair_id);
        }
    });

    let filteredData = globalFlightsData.filter(f => pairsToPrint.has(f.pair_id));

    if(filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="27" class="empty-state">해당 날짜 및 근무조에 배정된 비행편이 없습니다.</td></tr>`;
        return;
    }

    let html = '';
    let i = 0;
    while (i < filteredData.length) {
        let f = filteredData[i];

        // ==========================================
        // ✈️ 국내선 렌더링 파트
        // ==========================================
        if (f.is_domestic) {
            let total = f.dom_total;
            let group =[];
            for (let j = 0; j < total; j++) {
                if (i + j < filteredData.length && filteredData[i+j].pair_id === f.pair_id) {
                    group.push(filteredData[i+j]);
                }
            }
            
            let base_active = (selectedDate === "" || group[0].shift_date === selectedDate) && (shiftFilter === 'all' || group[0].shift_code === shiftFilter);
            let ui_active = base_active || is_all_shifts; 
            
            let doc_val = ui_active ? '□' : '■';
            let box_ui = `<span style="float:right; margin-left: 10px;">${ui_active ? '□' : '■'}</span>`;
            let gray_class = ui_active ? '' : 'bg-gray-out';
            let brf_active = is_all_shifts || (group[0].briefing_shift_code === shiftFilter);
            let brf_class = brf_active ? '' : 'bg-gray-out';
            let ramp_class = ui_active ? '' : 'bg-gray-out';

            // 🌟 [핵심 변경] 국내선 ATC는 야간조 전담!
            let atc_val = '■';
            let atc_class = 'bg-gray-out';
            
            if (is_all_shifts) {
                atc_val = '□'; atc_class = '';
            } else if (shiftFilter === 'night') {
                atc_val = '□'; atc_class = ''; // 야간조는 모두 활성화 (흰 칸)
            } else if (shiftFilter === 'morning') {
                atc_val = '■'; // 오전조는 이미 제출됐으므로 까만 네모
                atc_class = ui_active ? '' : 'bg-gray-out';
            }

            for (let k = 0; k < group.length; k += 2) {
                let o = group[k];
                let r = group[k+1];
                let o_rwy = o.rwy_html || ''; let r_rwy = r.rwy_html || '';

                // 왕편(Outbound)
                html += `<tr>`;
                html += `<td rowspan="2" class="mel-cell">${o.mel_str}</td>`;
                html += `<td rowspan="2" style="font-weight:bold;">${o.reg}</td>`;
                html += `<td class="cpt-cell">${formatCpt(o.cpt, o.is_target_cpt)}</td>`;
                html += `<td style="font-weight:bold; ${!o.is_from_aar ? 'color:#d93025;' : ''}">${o.flt_num}</td>`;
                html += `<td class="route-cell">${o.route}</td>`;
                html += `<td>${o.etd_z}</td><td>${o.eta_z}</td>`;
                html += `<td style="color:blue;">${o.etd_k}</td><td style="color:blue;">${o.eta_k}</td>`;
                html += `<td style="color:#888;">${o.altn_print}</td>`;
                html += `<td class="pax-cell ${gray_class}">${box_ui}</td>`;
                
                let flex_rwy = `<div style="display:flex; justify-content:space-evenly; align-items:center; height:100%;">
                    <div style="flex:1; ${r ? 'border-right:1px solid #ddd; padding-right:4px;' : ''}">${o_rwy}</div>
                    <div style="flex:1; ${r ? 'padding-left:4px;' : ''}">${r ? r_rwy : ''}</div>
                </div>`;
                html += `<td rowspan="2" class="weather-cell ${gray_class}">${flex_rwy}</td>`;
                
                html += `<td class="${gray_class}"></td>`; 
                
                // 🌟 국내선 전용 ATC 적용
                html += `<td class="${atc_class}">${atc_val}</td>`; 
                if (k === 0) html += `<td rowspan="${total}" class="bg-gray-out"></td>`; 
                html += `<td>${doc_val}</td><td>${doc_val}</td><td class="bg-gray-out"></td><td>${doc_val}</td>`; 
                
                html += `<td class="${ramp_class} ramp-cell"></td><td class="${ramp_class} tgt-cell"></td>`; 
                html += `<td></td><td></td>`; 
                html += `<td style="font-size:10px; font-weight:bold;">${o.dow}</td><td style="font-weight:bold;">${o.taxi_fuel}</td>`; 
                if (k === 0) html += `<td rowspan="${total}" class="${brf_class}" style="font-weight:bold;">${o.briefing_time}</td>`; 
                html += `<td class="remarks-cell">${o.remarks}</td>`;
                html += `</tr>`;

                // 복편(Inbound)
                html += `<tr>`;
                html += `<td class="cpt-cell">${formatCpt(r.cpt, r.is_target_cpt)}</td>`;
                html += `<td style="font-weight:bold; ${!r.is_from_aar ? 'color:#d93025;' : ''}">${r.flt_num}</td>`;
                html += `<td class="route-cell">${r.route}</td>`;
                html += `<td>${r.etd_z}</td><td>${r.eta_z}</td>`;
                html += `<td style="color:blue;">${r.etd_k}</td><td style="color:blue;">${r.eta_k}</td>`;
                html += `<td style="color:#888;">${r.altn_print}</td>`;
                html += `<td class="pax-cell ${gray_class}">${box_ui}</td>`;
                
                html += `<td class="${gray_class}"></td>`; 
                
                // 🌟 국내선 전용 ATC 적용 (rowspan 때문에 구조 다름)
                html += `<td class="${atc_class}">${atc_val}</td><td>${doc_val}</td><td>${doc_val}</td><td class="bg-gray-out"></td><td>${doc_val}</td>`; 
                
                html += `<td class="${ramp_class} ramp-cell"></td><td class="${ramp_class} tgt-cell"></td>`; 
                html += `<td></td><td></td>`; 
                html += `<td style="font-size:10px; font-weight:bold;">${r.dow}</td><td style="font-weight:bold;">${r.taxi_fuel}</td>`; 
                html += `<td class="remarks-cell">${r.remarks}</td>`;
                html += `</tr>`;
            }
            i += group.length;

        // ==========================================
        // ✈️ 국제선 렌더링 파트
        // ==========================================
        } else {
            let o = f;
            let r = (i + 1 < filteredData.length && !filteredData[i+1].is_outbound) ? filteredData[i+1] : null;
            if (!r) { i++; continue; }

            let o_ui_active = (selectedDate === "" || o.shift_date === selectedDate) && (shiftFilter === 'all' || o.shift_code === shiftFilter) || is_all_shifts;
            let r_ui_active = (selectedDate === "" || r.shift_date === selectedDate) && (shiftFilter === 'all' || r.shift_code === shiftFilter) || is_all_shifts;

            let brf_active = is_all_shifts || (o.briefing_shift_code === shiftFilter);
            let brf_class = brf_active ? '' : 'bg-gray-out';

            // 🌟 [핵심 변경] 국제선 ATC는 무조건 '왕편 담당자'가 복편까지 수행함!
            let o_atc_val = o_ui_active ? '□' : '■';
            let o_atc_class = o_ui_active ? '' : 'bg-gray-out';
            
            // 복편(r)의 ATC도 왕편(o)의 ui_active 상태를 그대로 따라감!
            let r_atc_val = o_ui_active ? '□' : '■'; 
            let r_atc_class = o_ui_active ? '' : 'bg-gray-out';

            if (r.num_only === '532' || r.num_only === '558') {
                r_atc_val = '';
                r_atc_class = 'bg-gray-out';
            }

            const atchClass = o.need_atch ? "" : "bg-gray-out";
            const atchVal = o.need_atch ? (o_ui_active ? '□' : '■') : '';
            let o_ofp_data = o_ui_active ? '□' : '■';
            let r_ofp_data = r_ui_active ? '□' : '■';

            const is_o_fuel = ['CJJ', 'CJU', 'ICN'].includes(o.dep);
            let is_r_fuel = ['CJJ', 'CJU', 'ICN'].includes(r.dep);
            
            // 522편 예외: 복귀편이지만 급유 메일 송부
            if (r.num_only === '522') {
                is_r_fuel = true;
            }

            let o_fuel_class = is_o_fuel ? '' : 'bg-gray-out';
            let r_fuel_class = is_r_fuel ? '' : 'bg-gray-out';
            let o_fuel_chk = is_o_fuel ? (o_ui_active ? '□' : '■') : '';
            let r_fuel_chk = is_r_fuel ? (r_ui_active ? '□' : '■') : '';

            let is_tankering = (o.tank_type !== "");
            let o_tank = is_tankering ? (o_ui_active ? '□' : '■') : 'bg-gray-out';
            
            let o_fuel_ramp_class = o_ui_active ? '' : 'bg-gray-out'; 
            let o_fuel_tgt_class = '';
            if (!o_ui_active && r_ui_active && o.need_atch) o_fuel_tgt_class = 'bg-yellow'; 
            else if (!o_ui_active) o_fuel_tgt_class = 'bg-gray-out';

            let r_fuel_tgt_val = ''; let r_fuel_tgt_class = '';
            if (is_tankering) {
                if (o_ui_active) { r_fuel_tgt_class = ''; r_fuel_tgt_val = r.tank_val; }
                else r_fuel_tgt_class = 'bg-gray-out';
            } else r_fuel_tgt_class = 'bg-gray-out';

            let r_fuel_ramp_class = (r_ui_active || r_fuel_tgt_val !== '') ? '' : 'bg-gray-out';
            let o_ext_rsn_val = is_tankering ? o.tank_type : '';

            let o_pax_remark_html = o.pax_remark ? `<div style="float:left; font-size:11px; color:#888; font-weight:bold; margin-top:2px;">${o.pax_remark}</div>` : '';
            let r_pax_remark_html = r.pax_remark ? `<div style="float:left; font-size:11px; color:#888; font-weight:bold; margin-top:2px;">${r.pax_remark}</div>` : '';

            let o_pax_box = `${o_pax_remark_html}<div style="float:right;">${o_ui_active ? '□' : '■'}</div><div style="clear:both;"></div>`;
            let r_pax_box = `${r_pax_remark_html}<div style="float:right;">${r_ui_active ? '□' : '■'}</div><div style="clear:both;"></div>`;

            let o_rwy = o.rwy_html || ''; let r_rwy = r.rwy_html || '';

            let rwy_bg = (o_ui_active || r_ui_active) ? '' : 'bg-gray-out';
            let o_op = o_ui_active ? '1' : '0.3';
            let r_op = r_ui_active ? '1' : '0.3';
            let flex_rwy = `<div style="display:flex; justify-content:space-evenly; align-items:center; height:100%;">
                <div style="flex:1; opacity:${o_op}; border-right:1px solid #ddd; padding-right:4px;">${o_rwy}</div>
                <div style="flex:1; opacity:${r_op}; padding-left:4px;">${r_rwy}</div>
            </div>`;

            // 왕편(Outbound)
            html += `
            <tr>
                <td rowspan="2" class="mel-cell">${o.mel_str}</td>
                <td rowspan="2" style="font-weight:bold;">${o.reg}</td>
                <td class="cpt-cell">${formatCpt(o.cpt, o.is_target_cpt)}</td>
                <td style="font-weight:bold; ${!o.is_from_aar ? 'color:#d93025;' : ''}">${o.flt_num}</td>
                <td class="route-cell">${o.route}</td>
                <td>${o.etd_z}</td><td>${o.eta_z}</td>
                <td style="color:blue;">${o.etd_k}</td><td style="color:blue;">${o.eta_k}</td>
                <td style="color:#888;">${o.altn_print}</td>
                
                <td class="pax-cell ${o_ui_active ? '' : 'bg-gray-out'}">${o_pax_box}</td>
                
                <td rowspan="2" class="weather-cell ${rwy_bg}">${flex_rwy}</td>
                <td class="${o_ui_active ? '' : 'bg-gray-out'}"></td>
                
                <!-- 🌟 왕편 ATC 적용 -->
                <td class="${o_atc_class}">${o_atc_val}</td>
                
                <td rowspan="2" class="${atchClass}">${atchVal}</td>
                <td>${o_ofp_data}</td><td>${o_ofp_data}</td>
                <td class="${is_tankering ? '' : 'bg-gray-out'}">${is_tankering ? o_tank : ''}</td>
                <td class="${o_fuel_class}">${o_fuel_chk}</td>
                
                <td class="${o_fuel_ramp_class} ramp-cell"></td>
                <td class="${o_fuel_tgt_class} tgt-cell"></td>
                
                <td style="font-weight:bold;">${o_ext_rsn_val}</td><td></td> 
                <td style="font-size:10px; font-weight:bold;">${o.dow}</td><td style="font-weight:bold;">${o.taxi_fuel}</td>
                <td rowspan="2" class="${brf_class}" style="font-weight:bold;">${o.briefing_time}</td>
                <td class="remarks-cell">${o.remarks}</td>
            </tr>`;
            
            // 복편(Inbound)
            html += `
            <tr>
                <td class="cpt-cell">${formatCpt(r.cpt, r.is_target_cpt)}</td>
                <td style="font-weight:bold; ${!r.is_from_aar ? 'color:#d93025;' : ''}">${r.flt_num}</td>
                <td class="route-cell">${r.route}</td>
                <td>${r.etd_z}</td><td>${r.eta_z}</td>
                <td style="color:blue;">${r.etd_k}</td><td style="color:blue;">${r.eta_k}</td>
                <td style="color:#888;">${r.altn_print}</td>
                <td class="pax-cell ${r_ui_active ? '' : 'bg-gray-out'}">${r_pax_box}</td>
                
                <td class="${r_ui_active ? '' : 'bg-gray-out'}"></td>
                
                <!-- 🌟 복편 ATC 적용 (왕편 담당자가 수행) -->
                <td class="${r_atc_class}">${r_atc_val}</td>
                
                <td>${r_ofp_data}</td><td>${r_ofp_data}</td>
                <td class="bg-gray-out"></td> 
                <td class="${r_fuel_class}">${r_fuel_chk}</td>
                
                <td class="${r_fuel_ramp_class} ramp-cell"></td>
                <td class="${r_fuel_tgt_class} tgt-cell" style="color:#d93025; font-weight:bold;">${r_fuel_tgt_val}</td>
                
                <td></td><td></td>
                <td style="font-size:10px; font-weight:bold;">${r.dow}</td><td style="font-weight:bold;">${r.taxi_fuel}</td>
                <td class="remarks-cell">${r.remarks}</td>
            </tr>`;
            i += 2;
        }
    }
    
    // ==========================================
    // 💡 MEL 주석 (Footnotes) 추가
    // ==========================================
    let allFootnotes = new Set();
    filteredData.forEach(f => {
        if (f.mel_footnotes && f.mel_footnotes.length > 0) {
            f.mel_footnotes.forEach(fn => allFootnotes.add(fn));
        }
    });
    
    if (allFootnotes.size > 0) {
        html += `<tr><td colspan="27" style="text-align:left; padding: 10px; background-color: #fff8f8; font-size: 11px; color: #d93025; font-weight: bold;">`;
        allFootnotes.forEach(fn => {
            html += `<div>${fn}</div>`;
        });
        html += `</td></tr>`;
    }

    tbody.innerHTML = html;
}

const AIRPORT_COORDS = {
    "CJJ": [36.716, 127.499], "ICN": [37.460, 126.440], "CJU": [33.511, 126.493],
    "KIX":[34.427, 135.244], "NRT":[35.764, 140.386], "FUK":[33.585, 130.450],
    "CTS":[42.775, 141.692], "NGO":[34.858, 136.805], "OKA":[26.195, 127.645],
    "IBR": [36.182, 140.413], "OBO":[42.873, 143.217], "KKJ":[33.845, 130.965],
    "HIJ":[34.436, 132.919], "TPE":[25.077, 121.232], "UBN":[47.652, 106.818],
    "DAD":[16.043, 108.199], "CXR":[11.998, 109.219], "CRK":[15.185, 120.559],
    "CEB":[10.307, 123.979], "HUN":[24.023, 121.618], "TAO":[36.266, 120.012],
    "TNA":[36.857, 117.215], "SJW":[38.280, 114.697], "YIH":[30.558, 111.478],
    "DSN":[39.490, 109.860], "HLD":[49.205, 119.824], "LHW":[36.515, 103.621],
    "HNA":[39.428, 141.136], "UKB":[34.632, 135.223], "HND":[35.549, 139.779],
    "MMJ":[36.166, 137.922]
};

// 2. 체크리스트 생성 및 기상청 연동
async function generateChecklist() {
    const rows = document.querySelectorAll('.edit-row');
    const melText = document.getElementById('mel-input-text').value; 
    const rawList =[];
    let neededAirports = new Set();
    
    rows.forEach(row => {
        const dep = row.querySelector('.e-dep').value;
        const arr = row.querySelector('.e-arr').value;
        neededAirports.add(dep);
        neededAirports.add(arr);

        rawList.push({
            pair_id: row.querySelector('.e-pair').value, 
            date_str: row.querySelector('.e-date').value,
            flt_num: row.querySelector('.e-flt').value,
            num_only: row.querySelector('.e-num').value,
            dep: dep, arr: arr,
            etd_z: row.querySelector('.e-etd').value,
            eta_z: row.querySelector('.e-eta').value,
            reg: row.querySelector('.e-reg').value,
            cpt: row.querySelector('.e-cpt').value,
            is_from_aar: row.dataset.fromAar === 'true'
        });
    });

    const btn = document.querySelector('#edit-section .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ 기상 데이터 수집 및 계산 중... (잠시만 기다려주세요)";
    btn.disabled = true;
    btn.style.opacity = "0.7";

    try {
        let aptsToFetch = Array.from(neededAirports).filter(apt => AIRPORT_COORDS[apt]);
        let weatherData = {};
        
        if (aptsToFetch.length > 0) {
            let lats = aptsToFetch.map(apt => AIRPORT_COORDS[apt][0]).join(',');
            let lons = aptsToFetch.map(apt => AIRPORT_COORDS[apt][1]).join(',');
            
            // 🌟 날씨 API 부분은 절대 건드리지 않았습니다!
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,pressure_msl,winddirection_10m,windspeed_10m,precipitation&windspeed_unit=kn&past_days=2&forecast_days=4&timezone=UTC`;
            
            const weatherRes = await fetch(url);
            if (weatherRes.ok) {
                const weatherJson = await weatherRes.json();
                const resList = Array.isArray(weatherJson) ? weatherJson : [weatherJson];
                aptsToFetch.forEach((apt, idx) => {
                    weatherData[apt] = resList[idx];
                });
            }
        }

        const response = await fetch('/checklist/api/calculate_checklist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw_data: rawList, mel_text: melText, weather_data: weatherData }) 
        });
        const result = await response.json();
        
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.opacity = "1";

        if(result.status === 'success') {
            globalFlightsData = result.data;
            filterPrintTable();
            switchTab('tab-print', document.querySelectorAll('#main-tabs button')[1]);
        } else {
            alert("생성 오류: " + (result.message || JSON.stringify(result.detail)));
        }
    } catch (error) { 
        console.error("통신 에러:", error); 
        alert("서버 통신 실패 (콘솔창 확인)");
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.style.opacity = "1";
    }
}