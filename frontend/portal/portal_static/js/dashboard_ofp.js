// dashboard_ofp.js
// OFP (Operational Flight Plan) 모달 처리 로직

// OFP_CONFIG는 이제 /api/config.js 에서 제공되는 window.OFP_CONFIG를 사용합니다.

async function openOfpModal(flightId, flightNumber, depGate, arrGate) {
    const modal = document.getElementById('ofp-modal');
    if (!modal) return;
    const modalBody = document.getElementById('modal-ofp-details');
    const modalTitle = document.getElementById('modal-flight-num');
    
    modalTitle.innerHTML = `${flightNumber || 'Flight Details'} <span style="font-size: 11px; font-weight: 600; background: rgba(139, 155, 180, 0.15); color: #8b9bb4; padding: 3px 8px; border-radius: 12px; margin-left: 10px; letter-spacing: 0.5px; vertical-align: middle;">OFP DATA</span>`;
    modalBody.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">Loading details...</p>';
    modal.classList.add('active');
    
    try {
        const response = await fetch(`/api/ofp/flight/${flightId}`);
        if (!response.ok) {
            if (response.status === 404) modalBody.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px;">No OFP Data Found.</p>';
            else throw new Error("Failed to fetch");
            return;
        }
        const data = await response.json();
        
        if (data.actual_pax_adult != null || data.dla_code) {
            modalTitle.innerHTML = `${flightNumber || 'Flight Details'} <span style="font-size: 11px; font-weight: 600; background: rgba(139, 155, 180, 0.15); color: #8b9bb4; padding: 3px 8px; border-radius: 12px; margin-left: 10px; letter-spacing: 0.5px; vertical-align: middle;">OFP DATA</span>`;
        }
        
        const finalDepGate = (data.special_info && data.special_info.stands && data.special_info.stands.dep) || depGate || '-';
        const finalArrGate = (data.special_info && data.special_info.stands && data.special_info.stands.arr) || arrGate || '-';

        const ezfw = data.ezfw || '-';
        const mzfw = data.mzfw || '-';
        const etow = data.etow || '-';
        const agtow = data.agtow || '-';
        const mtow = data.mtow || '-';
        let rtow = '-';
        if (data.special_info && data.special_info.rtows && data.special_info.rtows.length > 0) {
            let rtowVal = parseFloat(data.special_info.rtows[0].weight);
            if (!isNaN(rtowVal)) {
                rtow = Math.round(rtowVal * 1000).toString();
            } else {
                rtow = data.special_info.rtows[0].weight;
            }
        }
        const eldw = data.eldw || '-';
        const mldw = data.mldw || '-';
        const dow = data.dow || '-';
        const payload = data.payload || '-';

        let melCdlHtml = '';
        if (data.mel_cdl && Array.isArray(data.mel_cdl) && data.mel_cdl.length > 0) {
            let items = data.mel_cdl.map(m => `<div style="font-size:12px; color:#cbd5e1; margin-bottom:4px;"><strong>${m.code||''}</strong> ${m.description||''}</div>`).join('');
            melCdlHtml = `
                <div class="ofp-section-title" style="margin-top: 25px;">MEL / CDL INFO</div>
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 12px 15px; margin-bottom: 25px;">
                    ${items}
                </div>
            `;
        }

        let profileViewHtml = '';
        if (data.route_data && Array.isArray(data.route_data) && data.route_data.length > 0) {
            let points = data.route_data.map(d => {
                let flStr = String(d.fl || '0').replace(/[^0-9]/g, '');
                let fl = parseInt(flStr) || 0;
                let rte = d.rte || ''; // Airway
                return { wpt: d.wpt || '-', fl: fl, flStr: d.fl || '0', rte: rte };
            }).filter(p => p.fl > 0 || p.wpt !== '-');
            
            // Robust extraction of DEP and ARR ICAO codes
            let depIcao = data.dep_airport || 'DEP';
            let arrIcao = data.arr_airport || 'ARR';
            if (data.route_str) {
                let rparts = data.route_str.trim().split(/\s+/);
                // Extract departure ICAO
                for (let p of rparts) {
                    if (p.startsWith('-')) p = p.substring(1);
                    if (p.length >= 4 && !p.includes('/')) { depIcao = p.substring(0,4); break; }
                }
                // Extract arrival ICAO
                for (let i = rparts.length - 1; i >= 0; i--) {
                    let p = rparts[i];
                    if (p.startsWith('-')) p = p.substring(1);
                    if (p.length >= 4 && !p.includes('/')) { arrIcao = p.substring(0,4); break; }
                }
            }

            // Remove IATA airport codes that appear at the very start or end (duplicate of the airport)
            let depIata = (data.dep_airport || '').toUpperCase();
            let arrIata = (data.arr_airport || '').toUpperCase();
            points = points.filter((p, i) => {
                let w = p.wpt.toUpperCase();
                if (w === depIata && w !== depIcao && i < 3) return false;
                if (w === arrIata && w !== arrIcao && i > points.length - 4) return false;
                return true;
            });
            
            // Ensure first point is DEP with FL 0
            if (points.length > 0 && points[0].wpt !== depIcao) {
                points.unshift({ wpt: depIcao, fl: 0, flStr: '0', rte: 'DCT' });
            } else if (points.length > 0) {
                points[0].fl = 0; points[0].flStr = '0';
            }
            
            // Ensure the last point is ARR with FL 0
            if (points.length > 0 && points[points.length - 1].wpt !== arrIcao) {
                points.push({ wpt: arrIcao, fl: 0, flStr: '0', rte: 'DCT' });
            } else if (points.length > 0) {
                points[points.length - 1].fl = 0; points[points.length - 1].flStr = '0';
            }

            // First pass: identify TOC and TOD to set FL explicitly before interpolation
            let tocIdx = -1;
            let todIdx = -1;
            let cruiseFl = 0;
            for (let i = 0; i < points.length; i++) {
                let w = points[i].wpt.toUpperCase();
                if (w.includes('TOC') || w.includes('T/C')) tocIdx = i;
                if (w.includes('TOD') || w.includes('T/D')) todIdx = i;
                if (points[i].fl > cruiseFl) cruiseFl = points[i].fl;
            }
            if (tocIdx > 0 && points[tocIdx].fl === 0) {
                for (let j = tocIdx + 1; j < points.length; j++) {
                    if (points[j].fl > 0) { points[tocIdx].fl = points[j].fl; points[tocIdx].flStr = points[j].flStr; break; }
                }
                if (points[tocIdx].fl === 0) { points[tocIdx].fl = cruiseFl; points[tocIdx].flStr = cruiseFl.toString(); }
            }
            if (todIdx > 0 && points[todIdx].fl === 0) {
                for (let j = todIdx - 1; j >= 0; j--) {
                    if (points[j].fl > 0) { points[todIdx].fl = points[j].fl; points[todIdx].flStr = points[j].flStr; break; }
                }
                if (points[todIdx].fl === 0) { points[todIdx].fl = cruiseFl; points[todIdx].flStr = cruiseFl.toString(); }
            }

            // Interpolate FL linearly
            let lastValidIdx = 0;
            for (let i = 1; i < points.length; i++) {
                if (points[i].fl > 0 || i === points.length - 1) {
                    let nextValidIdx = i;
                    let nextFl = points[nextValidIdx].fl;
                    let prevFl = points[lastValidIdx].fl;
                    
                    let diff = nextValidIdx - lastValidIdx;
                    if (diff > 1) {
                        for (let j = lastValidIdx + 1; j < nextValidIdx; j++) {
                            if (tocIdx !== -1 && todIdx !== -1 && j > tocIdx && j < todIdx) {
                                points[j].fl = prevFl; // Flat cruise
                                points[j].flStr = points[lastValidIdx].flStr;
                            } else {
                                points[j].fl = prevFl + (nextFl - prevFl) * ((j - lastValidIdx) / diff);
                                points[j].flStr = (tocIdx !== -1 && j < tocIdx) ? 'CLB' : 'DSC';
                            }
                        }
                    }
                    lastValidIdx = nextValidIdx;
                }
            }

            let atcWpts = new Set();
            if (data.route_str) {
                let parts = data.route_str.split(/[\s+/]/);
                parts.forEach(p => {
                    let clean = p.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                    if (clean.length > 0) atcWpts.add(clean);
                });
            }
            
            let filteredPoints = [];
            for (let i = 0; i < points.length; i++) {
                let p = points[i];
                let isFirst = (i === 0);
                let isLast = (i === points.length - 1);
                
                let isFlChange = false;
                if (i > 0 && i < points.length - 1) {
                    let prev = points[i-1];
                    let next = points[i+1];
                    if (tocIdx !== -1 && todIdx !== -1 && i >= tocIdx && i <= todIdx) {
                        if (p.fl !== prev.fl && p.fl === next.fl) isFlChange = true;
                        if (p.fl === prev.fl && p.fl !== next.fl) isFlChange = true;
                    }
                }
                
                let w = p.wpt.toUpperCase();
                let isATC = atcWpts.has(w);
                let isMajor = w.includes('TOC') || w.includes('TOD') || w.includes('T/C') || w.includes('T/D');
                
                if (isFirst || isLast || isATC || isMajor || isFlChange) {
                    if (filteredPoints.length > 0 && filteredPoints[filteredPoints.length-1].wpt === p.wpt) continue;
                    filteredPoints.push(p);
                }
            }
            points = filteredPoints;

            if (points.length >= 2) {
                let maxFl = Math.max(...points.map(p => p.fl));
                if (maxFl === 0) maxFl = 400;
                
                let svgWidth = Math.max(900, points.length * 50); 
                let svgHeight = 220; 
                let paddingY = 70; 
                let paddingX = 40; 
                let graphHeight = svgHeight - paddingY - 30; 
                let xStep = (svgWidth - (paddingX * 2)) / (points.length - 1 || 1); 
                
                let pointsCoords = points.map((p, i) => {
                    let x = i * xStep + paddingX; 
                    let yNorm = (p.fl) / (maxFl * 1.1) * graphHeight;
                    let y = svgHeight - paddingY - yNorm;
                    return {...p, x, y};
                });
                
                let pathD = pointsCoords.map((p, i) => (i===0?'M':'L') + `${p.x},${p.y}`).join(' ');
                
                profileViewHtml = `
                    <div class="ofp-section-title" style="margin-top: 15px;">PROFILE VIEW</div>
                    <div style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 15px 0 5px 0; overflow: hidden; margin-bottom: 25px;">
                        <svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" style="display: block; width: 100%; height: auto; max-height: 250px;">
                            <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="2" />
                            ${pointsCoords.map((p, i) => {
                                let airwayText = '';
                                if (i < pointsCoords.length - 1) {
                                    let nextP = pointsCoords[i+1];
                                    let midX = (p.x + nextP.x) / 2;
                                    let midY = (p.y + nextP.y) / 2;
                                    let rteName = nextP.rte || 'DCT';
                                    if (rteName.toUpperCase() !== p.wpt.toUpperCase()) {
                                        // Move airway text securely BELOW the line
                                        airwayText = `<text x="${midX}" y="${midY + 16}" fill="#64748b" font-size="10" font-family="Consolas, monospace" font-weight="bold" text-anchor="middle">${rteName}</text>`;
                                    }
                                }
                                return `
                                    ${airwayText}
                                    <line x1="${p.x}" y1="${svgHeight - paddingY + 10}" x2="${p.x}" y2="${p.y + 10}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="2,3"/>
                                    <circle cx="${p.x}" cy="${p.y}" r="4" fill="#1e293b" stroke="#60a5fa" stroke-width="2" />
                                    <text x="${p.x}" y="${p.y - 12}" fill="#e2e8f0" font-size="11" font-family="Consolas, monospace" text-anchor="middle">${p.flStr}</text>
                                    <text x="${p.x - 2}" y="${svgHeight - paddingY + 20}" fill="#94a3b8" font-size="11" font-weight="bold" font-family="Consolas, monospace" text-anchor="start" transform="rotate(45, ${p.x - 2}, ${svgHeight - paddingY + 20})">${p.wpt}</text>
                                `;
                            }).join('')}
                        </svg>
                    </div>
                `;
            }
        }
        const ezfwVal = parseFloat(ezfw) || 0;
        const mzfwVal = parseFloat(mzfw) || 0;
        const ezfwPercent = mzfwVal > 0 ? Math.min(100, (ezfwVal / mzfwVal) * 100) : 0;
        const ezfwMargin = mzfwVal > 0 ? (mzfwVal - ezfwVal) : 0;
        const ezfwMarginText = mzfwVal > 0 ? (ezfwMargin >= 0 ? `AVL<br>${ezfwMargin}` : `OVR<br>${Math.abs(ezfwMargin)}`) : '';
        const ezfwFillClass = ezfwPercent > 95 ? 'danger' : (ezfwPercent > 85 ? 'warning' : '');
        const ezfwProgressHtml = mzfwVal > 0 ? `
            <div class="weight-bar-wrapper">
                <div class="weight-margin-text ${ezfwMargin < 0 ? 'danger' : ''}">${ezfwMarginText}</div>
            </div>` : '<div class="weight-bar-wrapper">-</div>';

        const etowVal = parseFloat(etow) || 0;
        const agtowVal = parseFloat(agtow) || 0;
        const etowPercent = agtowVal > 0 ? Math.min(100, (etowVal / agtowVal) * 100) : 0;
        const etowMargin = agtowVal > 0 ? (agtowVal - etowVal) : 0;
        const etowMarginText = agtowVal > 0 ? (etowMargin >= 0 ? `AVL<br>${etowMargin}` : `OVR<br>${Math.abs(etowMargin)}`) : '';
        const etowFillClass = etowPercent > 95 ? 'danger' : (etowPercent > 85 ? 'warning' : '');
        const etowProgressHtml = agtowVal > 0 ? `
            <div class="weight-bar-wrapper">
                <div class="weight-margin-text ${etowMargin < 0 ? 'danger' : ''}">${etowMarginText}</div>
            </div>` : '<div class="weight-bar-wrapper">-</div>';

        const eldwVal = parseFloat(eldw) || 0;
        const mldwVal = parseFloat(mldw) || 0;
        const eldwPercent = mldwVal > 0 ? Math.min(100, (eldwVal / mldwVal) * 100) : 0;
        const eldwMargin = mldwVal > 0 ? (mldwVal - eldwVal) : 0;
        const eldwMarginText = mldwVal > 0 ? (eldwMargin >= 0 ? `AVL<br>${eldwMargin}` : `OVR<br>${Math.abs(eldwMargin)}`) : '';
        const eldwFillClass = eldwPercent > 95 ? 'danger' : (eldwPercent > 85 ? 'warning' : '');
        const eldwProgressHtml = mldwVal > 0 ? `
            <div class="weight-bar-wrapper">
                <div class="weight-margin-text ${eldwMargin < 0 ? 'danger' : ''}">${eldwMarginText}</div>
            </div>` : '<div class="weight-bar-wrapper">-</div>';

        const payloadVal = parseFloat(payload) || 0;

        let dist = '-';
        let nam = '-';
        if (data.dist_nam) {
            let parts = data.dist_nam.split('/');
            dist = parts[0] || '-';
            nam = parts[1] || '-';
        }
        
        let displayDist = data.distance || data.dist || dist;
        let displayNam = data.nam || nam;
        if (displayDist && displayDist !== '-') displayDist = String(displayDist).replace(/^0+(?=\d)/, '');
        if (displayNam && displayNam !== '-') displayNam = String(displayNam).replace(/^0+(?=\d)/, '');

        let wind = data.wind_temp || '-';

        let dowLabelAddon = '';
        if (data.aircraft_reg && OFP_CONFIG.DOW_DB[data.aircraft_reg] && dow !== '-') {
            let dowValStr = dow.toString().replace(/,/g, '').trim();
            for (const [k, v] of Object.entries(OFP_CONFIG.DOW_DB[data.aircraft_reg])) {
                if (v.replace(/,/g, '') === dowValStr) {
                    dowLabelAddon = ` <span style="font-size: 10px; color: var(--ak-yellow); margin-left: 6px; font-weight: normal;">[${k}]</span>`;
                    break;
                }
            }
        }

        let oooiHtml = '';
        if (data.actual_out || data.actual_off || data.actual_on || data.actual_in) {
            let parts = [];
            if (data.actual_out) parts.push(`<span>OUT <span style="color: #fff; margin-left: 4px;">${data.actual_out}</span></span>`);
            if (data.actual_off) parts.push(`<span>OFF <span style="color: #fff; margin-left: 4px;">${data.actual_off}</span></span>`);
            if (data.actual_on) parts.push(`<span>ON <span style="color: #fff; margin-left: 4px;">${data.actual_on}</span></span>`);
            if (data.actual_in) parts.push(`<span>IN <span style="color: #fff; margin-left: 4px;">${data.actual_in}</span></span>`);
            
            oooiHtml = `
                <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 10px; margin-top: 10px; display: flex; justify-content: flex-end; align-items: center; font-size: 12px; font-weight: 600; font-family: 'Consolas', 'Courier New', monospace; color: #94a3b8;">
                    <div style="display: flex; gap: 15px; align-items: center;">
                        ${parts.join('<span style="color: rgba(255,255,255,0.15);">|</span>')}
                    </div>
                </div>
            `;
        }

        modalBody.innerHTML = `
            <!-- Modern Header for Core Info -->
            <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 15px 25px; margin-bottom: 25px; border-left: 4px solid var(--ak-yellow); display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 20px;">
                        <div style="font-size: 24px; font-weight: 800; color: #fff; letter-spacing: 1px;">${flightNumber || '-'}</div>
                        <div style="width: 1px; height: 24px; background: rgba(255,255,255,0.15);"></div>
                        <div style="display: flex; align-items: center; gap: 15px; font-size: 16px; font-weight: 600; color: #e2e8f0; letter-spacing: 0.5px;">
                            <span>${data.dep_airport || '-'}</span>
                            <span style="color: #64748b;">-</span>
                            <span>${data.arr_airport || '-'}</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 15px; font-size: 13px; font-weight: 600; font-family: 'Consolas', 'Courier New', monospace; color: #94a3b8; flex-wrap: wrap;">
                        <span>${data.date_str || '-'}</span>
                        <span style="color: rgba(255,255,255,0.2);">|</span>
                        <span>REG <span style="color: #fff; margin-left: 4px;">${data.aircraft_reg || '-'}</span></span>
                        <span style="color: rgba(255,255,255,0.2);">|</span>
                        <span>CFP NBR <span style="color: var(--ak-yellow); margin-left: 4px;">${data.cfp_number || '-'}</span></span>
                    </div>
                </div>
                ${oooiHtml}
            </div>

            <div class="ofp-grid-3col">
                <!-- Column 1: Flight Information -->
                <div style="display: flex; flex-direction: column;">
                    <div class="ofp-section-title">FLIGHT INFORMATION</div>
                    <style>
                        .flight-info-col .ofp-data-row {
                            padding: 5.2px 0 !important;
                        }
                        .ofp-card-stretch {
                            height: 100%;
                            box-sizing: border-box;
                            margin-bottom: 0 !important;
                            display: flex;
                            flex-direction: column;
                        }
                        .ofp-card-stretch > div {
                            flex-shrink: 0;
                        }
                        .ofp-card-stretch > .spacer-flex {
                            flex: 1;
                        }
                    </style>
                    <div class="ofp-card flight-info-col ofp-card-stretch">
                        <!-- Basic Flight Info -->
                        <div class="ofp-data-row"><div class="ofp-lbl">STD / STA</div><div class="ofp-val-group"><span class="ofp-val">${data.std || '-'} / ${data.sta || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">ETD / ETA</div><div class="ofp-val-group"><span class="ofp-val">${data.etd || '-'} / ${data.eta || '-'}</span></div></div>
                        
                        ${(function() {
                            if (!data.dla_code) return `<div class="ofp-data-row"><div class="ofp-lbl">DELAY (CODE)</div><div class="ofp-val-group"><span class="ofp-val">-</span></div></div>`;
                            let formattedDla = data.dla_code.split(',').map(dla => {
                                let parts = dla.trim().replace(/^E?DL/, '').split('/');
                                let res = [];
                                for (let i = 0; i < parts.length - 1; i += 2) {
                                    let code = parts[i];
                                    let time = parseInt(parts[i+1], 10);
                                    if (!isNaN(time)) res.push('+' + time + ' MIN (' + code + ')');
                                    else res.push(code + '/' + parts[i+1]);
                                }
                                if (parts.length % 2 !== 0) res.push(parts[parts.length - 1]);
                                return res.join(' / ');
                            }).join(', ');
                            return `<div class="ofp-data-row"><div class="ofp-lbl">DELAY (CODE)</div><div class="ofp-val-group"><span class="ofp-val" style="color: #4DD0E1;">${formattedDla}</span></div></div>`;
                        })()}
                        
                        <div class="ofp-data-row"><div class="ofp-lbl">PAX (PLN/ACT)</div><div class="ofp-val-group"><span class="ofp-val">${data.pax_ttl || '-'}${data.actual_pax_adult != null ? ' / <span style="color: #4DD0E1;">' + data.actual_pax_adult + (data.actual_pax_infant > 0 ? '(' + data.actual_pax_infant + ')' : '') + '</span>' : ' / <span style="color: #4DD0E1;">-</span>'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">SPOT (DEP/ARR)</div><div class="ofp-val-group"><span class="ofp-val">${finalDepGate} / ${finalArrGate}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">DISPATCHER</div><div class="ofp-val-group"><span class="ofp-val">${data.dispatcher || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">PIC</div><div class="ofp-val-group"><span class="ofp-val">${data.pic || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">COMPUTED</div><div class="ofp-val-group"><span class="ofp-val">${data.computed_time || '-'}</span></div></div>
                        
                        <div style="margin: 15px -20px 10px -20px; border-bottom: 1px solid rgba(255,255,255,0.05);"></div>
                        
                        <!-- Route & Operation Info -->
                        <div class="ofp-data-row"><div class="ofp-lbl" style="color:var(--ak-yellow);">DEST ALTN</div><div class="ofp-val-group"><span class="ofp-val highlight">${(data.alternates && data.alternates.length > 0) ? data.alternates[0].name : '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">FLIGHT TIME</div><div class="ofp-val-group"><span class="ofp-val">${data.trip_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">DIST</div><div class="ofp-val-group"><span class="ofp-val">${displayDist}</span> <span class="ofp-unit">NM</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">NAM</div><div class="ofp-val-group"><span class="ofp-val">${displayNam}</span> <span class="ofp-unit">NM</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl" style="color:var(--ak-yellow);">PLN FL</div><div class="ofp-val-group"><span class="ofp-val highlight">${data.pln_fl || data.crz_fl || data.crz_sys || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">WIND</div><div class="ofp-val-group"><span class="ofp-val">${data.wind || wind}</span></div></div>
                    </div>
                    ${melCdlHtml}
                </div>

                <!-- Column 2: Fuel Information -->
                <div style="display: flex; flex-direction: column;">
                    <div class="ofp-section-title">FLIGHT FUEL INFORMATION</div>
                    <div class="ofp-card ofp-card-stretch">
                        <div class="ofp-data-row fuel-total-row"><div class="ofp-lbl" style="color:#fff; font-size:13px; font-weight:700;">REQF</div><div class="ofp-val-group"><span class="ofp-val bold" style="font-size:16px; color:#fff;">${data.reqf_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.reqf_time || '-'}</span></div></div>
                        
                        <div class="ofp-data-row"><div class="ofp-lbl fuel-indent">TRIP</div><div class="ofp-val-group"><span class="ofp-val">${data.trip_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.trip_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl fuel-indent">CONT</div><div class="ofp-val-group"><span class="ofp-val">${data.cont_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.cont_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl fuel-indent">ALTN</div><div class="ofp-val-group"><span class="ofp-val">${data.altn_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.altn_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl fuel-indent">FRSV</div><div class="ofp-val-group"><span class="ofp-val">${data.frsv_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.frsv_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl fuel-indent">ADDI</div><div class="ofp-val-group"><span class="ofp-val">${data.addi_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.addi_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl fuel-indent">TAXI</div><div class="ofp-val-group"><span class="ofp-val">${data.taxi_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;"></span></div></div>
                        
                        <div class="ofp-data-row" style="margin-top: 10px;"><div class="ofp-lbl" style="color:var(--ak-yellow);">EXTRA <span style="font-size: 10px; color: var(--ak-yellow); margin-left: 6px; font-weight: normal;">${data.extra_reason ? `[${data.extra_reason}]` : ''}</span></div><div class="ofp-val-group"><span class="ofp-val highlight">${data.extra_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.extra_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">CCF</div><div class="ofp-val-group"><span class="ofp-val">${data.ccf_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.ccf_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">TANK</div><div class="ofp-val-group"><span class="ofp-val">${data.tank_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.tank_time || '-'}</span></div></div>
                        
                        <div class="ofp-data-row" style="margin-top: 10px;"><div class="ofp-lbl" style="color:var(--ak-yellow);">RAMP</div><div class="ofp-val-group"><span class="ofp-val highlight">${data.ramp_fuel || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.ramp_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">MIN RSV</div><div class="ofp-val-group"><span class="ofp-val">${data.min_rsv || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.min_rsv_time || '-'}</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">EFOB</div><div class="ofp-val-group"><span class="ofp-val">${data.efob || '-'}</span> <span class="ofp-unit" style="width: 40px; text-align: right;">${data.efob_time || '-'}</span></div></div>
                    </div>
                </div>

                <!-- Column 3: Weight Information -->
                <div style="display: flex; flex-direction: column;">
                    <div class="ofp-section-title" style="${data.mel_cdl && data.mel_cdl.length > 0 ? '' : ''}">FLIGHT WEIGHT INFORMATION</div>
                    <div class="ofp-card ofp-card-stretch">
                        <!-- Standard Weights -->
                        <div class="ofp-data-row" style="background: rgba(255,255,255,0.02); padding: 4px 10px; margin: -5px -10px 5px -10px; border-radius: 4px;"><div class="ofp-lbl">DOW${dowLabelAddon}</div><div class="ofp-val-group"><span class="ofp-val">${dow}</span> <span class="ofp-unit">KGS</span></div></div>
                        <div class="ofp-data-row" style="background: rgba(255,255,255,0.02); padding: 4px 10px; margin: -5px -10px 5px -10px; border-radius: 4px;"><div class="ofp-lbl">PAYLOAD</div><div class="ofp-val-group"><span class="ofp-val">${payload}</span> <span class="ofp-unit">KGS</span></div></div>
                        
                        <div style="margin: 15px -20px 10px -20px; border-bottom: 1px solid rgba(255,255,255,0.05);"></div>

                        <!-- Comparisons (Side-by-side) -->
                        <div class="weight-compare-box">
                            <div class="weight-item">
                                <div class="ofp-lbl">EZFW</div>
                                <div class="ofp-val-group"><span class="ofp-val bold">${ezfw}</span><span class="ofp-unit">KGS</span></div>
                            </div>
                            ${ezfwProgressHtml}
                            <div class="weight-item right">
                                <div class="ofp-lbl">MZFW</div>
                                <div class="ofp-val-group"><span class="ofp-val">${mzfw}</span><span class="ofp-unit">KGS</span></div>
                            </div>
                        </div>

                        <div class="weight-compare-box">
                            <div class="weight-item">
                                <div class="ofp-lbl">ETOW</div>
                                <div class="ofp-val-group"><span class="ofp-val bold">${etow}</span><span class="ofp-unit">KGS</span></div>
                            </div>
                            ${etowProgressHtml}
                            <div class="weight-item right">
                                <div class="ofp-lbl">AGTOW</div>
                                <div class="ofp-val-group"><span class="ofp-val bold" style="color: #fff;">${agtow}</span><span class="ofp-unit">KGS</span></div>
                            </div>
                        </div>

                        <div class="weight-compare-box">
                            <div class="weight-item">
                                <div class="ofp-lbl">ELDW</div>
                                <div class="ofp-val-group"><span class="ofp-val bold">${eldw}</span><span class="ofp-unit">KGS</span></div>
                            </div>
                            ${eldwProgressHtml}
                            <div class="weight-item right">
                                <div class="ofp-lbl">MLDW</div>
                                <div class="ofp-val-group"><span class="ofp-val">${mldw}</span><span class="ofp-unit">KGS</span></div>
                            </div>
                        </div>

                        <div style="margin: 5px -20px 8px -20px; border-bottom: 1px solid rgba(255,255,255,0.05);"></div>

                        <!-- Other Limits -->
                        <div class="ofp-data-row"><div class="ofp-lbl">MTOW</div><div class="ofp-val-group"><span class="ofp-val">${mtow}</span> <span class="ofp-unit">KGS</span></div></div>
                        <div class="ofp-data-row"><div class="ofp-lbl">RTOW</div><div class="ofp-val-group"><span class="ofp-val">${rtow}</span> <span class="ofp-unit">KGS</span></div></div>
                        
                        <div class="spacer-flex"></div>
                    </div>
                </div>
            </div>

            ${profileViewHtml}
        `;    } catch (error) { modalBody.innerHTML = '<p style="color: #f87171; text-align: center; padding: 40px;">Error loading data.</p>'; }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => { document.getElementById('ofp-modal').classList.remove('active'); });
    }
    const ofpModal = document.getElementById('ofp-modal');
    if (ofpModal) {
        ofpModal.addEventListener('click', (e) => { if (e.target === ofpModal) ofpModal.classList.remove('active'); });
    }
});
