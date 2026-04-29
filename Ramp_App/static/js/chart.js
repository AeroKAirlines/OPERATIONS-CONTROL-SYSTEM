import { CONFIG } from './core/config.js';
import { formatFlight, formatIsoTime } from './core/utils.js';
import { itemsDataSet, groupsDataSet, itemsDataSetReg, groupsDataSetReg, state } from './core/store.js';

if (window.vis && vis.moment) {
    vis.moment.locale('en');
}

export let timeline = null;
export let timelineReg = null;
let regColorMap = {};
let colorIndex = 0;

export const groupsDataView = new vis.DataView(groupsDataSet, {
    filter: function (group) {
        if (group.id === '미정') return true; 
        const chk = document.getElementById('chkShowRareStands');
        const showRare = chk ? chk.checked : false;
        if (showRare) return true; 
        const rareStands =['1', '12', '12R', '13', '13L', '13R'];
        return !rareStands.includes(group.id); 
    }
});

export function updateItemClasses() {
    const updates =[];
    itemsDataSet.get().forEach(item => {
        if (item.type === 'point' && !item.isLink) {
            let classes =[];
            if (item.isActive === false) classes.push('is-inactive'); 
            if (item.isModified) classes.push('is-modified');
            
            if (state.currentHighlightedReg && item.reg === state.currentHighlightedReg && !item.isOther) {
                classes.push('is-highlighted');
            }
            if (state.currentHighlightedPairs.includes(item.id)) {
                classes.push('is-pair-highlighted');
            }

            const newClassName = classes.join(' ');
            if (item.className !== newClassName) {
                updates.push({ id: item.id, className: newClassName });
            }
        }
    });
    if (updates.length > 0) itemsDataSet.update(updates);
}

export function evaluateConnections() {
    const allItems = itemsDataSet.get();
    const boxes = allItems.filter(i => i.type === 'point' && !i.isLink && i.isActive !== false && i.reg !== 'UNKNOWN');
    const oldLinks = allItems.filter(i => i.isLink); 
    
    itemsDataSet.remove(oldLinks.map(l => l.id)); 
    itemsDataSetReg.clear(); 
    
    let newLinks =[], updates =[], regItems =[], regGroups = {};

    boxes.forEach(b => {
        if (!regGroups[b.reg]) regGroups[b.reg] =[];
        regGroups[b.reg].push(b);
    });

    const isColorizeError = document.getElementById('chkColorizeError') ? document.getElementById('chkColorizeError').checked : false;

    for (let reg in regGroups) {
        let groupItems = regGroups[reg].sort((a, b) => new Date(a.start) - new Date(b.start));
        let i = 0;
        while (i < groupItems.length) {
            let curr = groupItems[i];
            let isOther = curr.isOther === true;
            let cNormal = isOther ? CONFIG.COLORS.other : CONFIG.COLORS.normal;
            let cTow = isOther ? CONFIG.COLORS.other : CONFIG.COLORS.tow;
            
            let cErr;
            if (isOther) cErr = CONFIG.COLORS.other;
            else if (isColorizeError) cErr = regColorMap[reg] || (regColorMap[reg] = CONFIG.WARNING_COLORS[colorIndex++ % CONFIG.WARNING_COLORS.length]);
            else cErr = CONFIG.COLORS.error;

            let lineClass = isOther ? 'connection-line towing-line-other' : 'connection-line towing-line';
            let markerClass = isOther ? 'towing-marker-other' : 'towing-marker';
            let updatedCurr = { id: curr.id, pairId: null };

            if (curr.flightType === 'ARR') {
                if (i + 1 < groupItems.length && groupItems[i+1].flightType === 'DEP') {
                    let next = groupItems[i+1];
                    let rawCurrStand = String(curr.rawStand || curr.group || '');
                    let rawNextStand = String(next.rawStand || next.group || '');

                    updatedCurr.pairId = next.id;
                    updates.push({ id: next.id, pairId: curr.id });

                    let arrLoc1 = rawCurrStand.includes('-') ? rawCurrStand.split('-')[0] : rawCurrStand;
                    let arrLoc2 = rawCurrStand.includes('-') ? rawCurrStand.split('-')[1] : rawCurrStand;
                    let depLoc1 = rawNextStand.includes('-') ? rawNextStand.split('-')[0] : rawNextStand;
                    let depLoc2 = rawNextStand.includes('-') ? rawNextStand.split('-')[1] : rawNextStand;

                    let isValid = (arrLoc2 === depLoc1);

                    if (!isOther) {
                        let barId = `reg_bar_${curr.id}_${next.id}`;
                        regItems.push({
                            id: barId, group: reg, start: curr.start, end: next.start, type: 'range',
                            className: isValid ? 'reg-bar-empty reg-normal' : 'reg-bar-empty reg-error',
                            arrStand: arrLoc1, depStand: depLoc2, arrRawStand: rawCurrStand, depRawStand: rawNextStand,
                            arrFlight: curr.flight, depFlight: next.flight, arrCity: curr.city, depCity: next.city,
                            arrStart: curr.start, depStart: next.start, isMainBar: true
                        });
                        regItems.push({
                            id: `reg_arr_${curr.id}`, group: reg, start: curr.start, type: 'point',
                            className: 'reg-label-point arr-label', isLabel: true, mainBarId: barId,
                            content: `<div class="reg-tag-wrap"><div class="tag-flight">${formatFlight(curr.flight)}</div><div class="tag-stand">${rawCurrStand.replace('-', '➔')}</div></div>`
                        });
                        regItems.push({
                            id: `reg_dep_${next.id}`, group: reg, start: next.start, type: 'point',
                            className: 'reg-label-point dep-label', isLabel: true, mainBarId: barId,
                            content: `<div class="reg-tag-wrap"><div class="tag-flight">${formatFlight(next.flight)}</div><div class="tag-stand">${rawNextStand.replace('-', '➔')}</div></div>`
                        });
                    }

                    if (isValid) {
                        let hasArrTow = (arrLoc1 !== arrLoc2), hasDepTow = (depLoc1 !== depLoc2);
                        let currOffset = curr.towOffset || 30, nextOffset = next.towOffset || 30;
                        let isAnyTow = hasArrTow || hasDepTow;
                        
                        updatedCurr.style = `--item-color: ${isAnyTow ? cTow : cNormal};`;
                        updates.push({ id: next.id, style: `--item-color: ${isAnyTow ? cTow : cNormal};` });

                        let t1 = new Date(curr.start).getTime(), t2 = new Date(next.start).getTime();

                        if (!hasArrTow && !hasDepTow) {
                            newLinks.push({ id: `link_${curr.id}_${next.id}`, group: arrLoc1, start: curr.start, end: next.start, type: 'range', isLink: true, className: 'connection-line', style: `background-color: ${cNormal}; opacity: ${isOther ? 0.6 : 1.0};` });
                        } else if (hasArrTow && !hasDepTow) {
                            let towTimeIso = formatIsoTime(Math.min(t1 + (currOffset * 60000), t2));
                            newLinks.push({ id: `link1_${curr.id}`, group: arrLoc1, start: curr.start, end: towTimeIso, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `link2_${curr.id}`, group: arrLoc2, start: towTimeIso, end: next.start, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `tow_${curr.id}`, group: arrLoc2, start: towTimeIso, type: 'point', isLink: true, fromStand: arrLoc1, toStand: arrLoc2, isTowMarker: true, className: markerClass });
                        } else if (!hasArrTow && hasDepTow) {
                            let towTimeIso = formatIsoTime(Math.max(t2 - (nextOffset * 60000), t1));
                            newLinks.push({ id: `link1_${curr.id}`, group: depLoc1, start: curr.start, end: towTimeIso, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `link2_${curr.id}`, group: depLoc2, start: towTimeIso, end: next.start, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `tow_${curr.id}`, group: depLoc2, start: towTimeIso, type: 'point', isLink: true, fromStand: depLoc1, toStand: depLoc2, isTowMarker: true, className: markerClass });
                        } else {
                            let tow1Iso = formatIsoTime(Math.min(t1 + (currOffset * 60000), t1 + (t2 - t1) / 2));
                            let tow2Iso = formatIsoTime(Math.max(t2 - (nextOffset * 60000), t1 + (t2 - t1) / 2));
                            newLinks.push({ id: `link1_${curr.id}`, group: arrLoc1, start: curr.start, end: tow1Iso, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `link2_${curr.id}`, group: arrLoc2, start: tow1Iso, end: tow2Iso, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `link3_${curr.id}`, group: depLoc2, start: tow2Iso, end: next.start, type: 'range', isLink: true, className: lineClass });
                            newLinks.push({ id: `tow1_${curr.id}`, group: arrLoc2, start: tow1Iso, type: 'point', isLink: true, fromStand: arrLoc1, toStand: arrLoc2, isTowMarker: true, className: markerClass });
                            newLinks.push({ id: `tow2_${curr.id}`, group: depLoc2, start: tow2Iso, type: 'point', isLink: true, fromStand: depLoc1, toStand: depLoc2, isTowMarker: true, className: markerClass });
                        }
                    } else {
                        updatedCurr.style = `--item-color: ${cErr};`;
                        updates.push({ id: next.id, style: `--item-color: ${cErr};` });
                    }
                    i += 2;
                } else {
                    if (!isOther) {
                        let fakeEndMs = new Date(curr.start).getTime() + (3 * 3600000); 
                        let barId = `reg_bar_${curr.id}`;
                        regItems.push({
                            id: barId, group: reg, start: curr.start, end: formatIsoTime(fakeEndMs), type: 'range', className: 'reg-bar-empty reg-normal reg-single-arr',
                            flightType: 'ARR', stand: curr.rawStand, flight: curr.flight, city: curr.city, time: curr.start, isMainBar: true
                        });
                        regItems.push({
                            id: `reg_arr_${curr.id}`, group: reg, start: curr.start, type: 'point', className: 'reg-label-point arr-label', isLabel: true, mainBarId: barId,
                            content: `<div class="reg-tag-wrap"><div class="tag-flight">${formatFlight(curr.flight)}</div><div class="tag-stand">${String(curr.rawStand || curr.group || '').replace('-', '➔')}</div></div>`
                        });
                    }
                    updatedCurr.style = `--item-color: ${isOther ? CONFIG.COLORS.other : (i === groupItems.length - 1 ? CONFIG.COLORS.singleEnd : cErr)};`;
                    i++;
                }
            } else {
                if (!isOther) {
                    let fakeStartMs = new Date(curr.start).getTime() - (3 * 3600000); 
                    let barId = `reg_bar_${curr.id}`;
                    regItems.push({
                        id: barId, group: reg, start: formatIsoTime(fakeStartMs), end: curr.start, type: 'range', className: 'reg-bar-empty reg-normal reg-single-dep',
                        flightType: 'DEP', stand: curr.rawStand, flight: curr.flight, city: curr.city, time: curr.start, isMainBar: true
                    });
                    regItems.push({
                        id: `reg_dep_${curr.id}`, group: reg, start: curr.start, type: 'point', className: 'reg-label-point dep-label', isLabel: true, mainBarId: barId,
                        content: `<div class="reg-tag-wrap"><div class="tag-flight">${formatFlight(curr.flight)}</div><div class="tag-stand">${String(curr.rawStand || curr.group || '').replace('-', '➔')}</div></div>`
                    });
                }
                updatedCurr.style = `--item-color: ${isOther ? CONFIG.COLORS.other : (i === 0 ? CONFIG.COLORS.singleStart : cErr)};`;
                i++;
            }
            updates.push(updatedCurr);
        }
    }
    
    allItems.filter(i => i.isActive === false).forEach(curr => {
        updates.push({ id: curr.id, style: `--item-color: ${CONFIG.COLORS.inactive};` });
    });

    itemsDataSet.update(updates);
    itemsDataSet.add(newLinks);
    itemsDataSetReg.add(regItems); 
}

export function showRegDetail(item) {
    if (!item) return;
    const panel = document.getElementById('regDetailPanel');
    const isUTC = document.getElementById('chkRegUTC').checked;

    function fmtTime(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        const h = isUTC ? d.getUTCHours() : d.getHours();
        const m = isUTC ? d.getUTCMinutes() : d.getMinutes();
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}${isUTC ? 'Z' : 'L'}`;
    }

    document.getElementById('detailReg').textContent = item.group;

    let arrRaw = item.arrRawStand || (item.flightType === 'ARR' ? item.stand : null);
    document.getElementById('detailArrStand').textContent = arrRaw ? arrRaw.replace('-', ' ➔ ') : '-';
    document.getElementById('detailArrFlight').textContent = item.arrFlight ? formatFlight(item.arrFlight) : (item.flightType === 'ARR' ? (item.flight ? formatFlight(item.flight) : '-') : '-');
    document.getElementById('detailArrCity').textContent = item.arrCity || (item.flightType==='ARR'?item.city:'-');
    document.getElementById('detailArrTime').textContent = fmtTime(item.arrStart || (item.flightType==='ARR'?item.time:null));

    let depRaw = item.depRawStand || (item.flightType === 'DEP' ? item.stand : null);
    document.getElementById('detailDepStand').textContent = depRaw ? depRaw.replace('-', ' ➔ ') : '-';
    document.getElementById('detailDepFlight').textContent = item.depFlight ? formatFlight(item.depFlight) : (item.flightType === 'DEP' ? (item.flight ? formatFlight(item.flight) : '-') : '-');
    document.getElementById('detailDepCity').textContent = item.depCity || (item.flightType==='DEP'?item.city:'-');
    document.getElementById('detailDepTime').textContent = fmtTime(item.depStart || (item.flightType==='DEP'?item.time:null));

    panel.style.display = 'block';
}

export function initTimeline(groupsData, itemsData, onOpenEdit, onCloseEdit) {
    regColorMap = {};
    colorIndex = 0;

    itemsData.forEach(item => {
        if (item.originalStart === undefined) item.originalStart = item.start;
        if (item.originalRawStand === undefined) item.originalRawStand = item.rawStand;
        if (item.baseContent === undefined) item.baseContent = item.content;
        if (item.isModified === undefined) item.isModified = false;
        if (item.className === undefined) item.className = '';
        if (item.towOffset === undefined) item.towOffset = 30; 
        if (item.isActive === undefined) item.isActive = true; 
        if (item.pairId === undefined) item.pairId = null;
    });

    const container = document.getElementById('visualization');
    groupsDataSet.clear(); groupsDataSet.add(groupsData);
    itemsDataSet.clear(); itemsDataSet.add(itemsData);

    // 🌟 누락되었던 기번 차트 그룹(Y축) 초기화 코드 복구 🌟
    if (groupsDataSetReg.length === 0) {
        const groupsRegData = CONFIG.AIRCRAFT_REGS.map((reg, idx) => ({ id: reg, content: reg, order: idx }));
        groupsDataSetReg.add(groupsRegData);
    }

    updateItemClasses(); 
    evaluateConnections();

    const options = {
        locale: 'en', groupOrder: 'order', orientation: 'top', editable: false, stack: false,
        margin: { item: { horizontal: 15, vertical: 12 }, axis: 6 }, 
        moment: function(date) {
            return document.getElementById('chkUTC').checked ? vis.moment(date).utc() : vis.moment(date);
        },
        template: function (item) {
            if (item.isLink && item.isTowMarker) {
                const towMode = document.querySelector('input[name="towDisplay"]:checked').value;
                return towMode === 'icon' ? '🚚' : `🚚 ${item.fromStand} ➔ ${item.toStand}`;
            }

            const showReg = document.getElementById('chkShowReg').checked;
            const showFlight = document.getElementById('chkShowFlight').checked;
            const showCity = document.getElementById('chkShowCity').checked;
            const showTime = document.getElementById('chkShowTime').checked;
            const showUnassigned = document.getElementById('chkShowUnassigned') ? document.getElementById('chkShowUnassigned').checked : true;

            let parts =[];
            if (item.isActive === false) {
                if (showUnassigned) parts.push('[미배정]');
            } else if (showReg && item.reg && item.reg !== 'UNKNOWN' && !item.isOther) {
                parts.push(item.reg);
            }
            if (showFlight && item.flight) {
                let fText = String(item.flight);
                if (!item.isOther && !fText.startsWith('RF')) fText = 'RF' + fText;
                parts.push(fText);
            }
            if (showTime && item.start) {
                const d = new Date(item.start);
                const isUTC = document.getElementById('chkUTC').checked;
                const h = isUTC ? d.getUTCHours() : d.getHours();
                const m = isUTC ? d.getUTCMinutes() : d.getMinutes();
                parts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${isUTC ? 'Z' : 'L'}`);
            }
            if (showCity && item.city) parts.push(item.city);

            return parts.join(' ');
        }
    };

    if (timeline) timeline.destroy(); 
    timeline = new vis.Timeline(container, itemsDataSet, groupsDataView, options);

    timeline.on('select', function (properties) {
        const selectedIds = properties.items;
        if (selectedIds.length > 0) {
            const selectedId = selectedIds[0];
            if (selectedId.toString().startsWith('link_') || selectedId.toString().startsWith('tow_')) return;
            
            const item = itemsDataSet.get(selectedId);
            const isHighlightAll = document.getElementById('chkHighlightReg').checked;
            
            if (isHighlightAll && item.isActive !== false && !item.isOther && item.reg && item.reg !== 'UNKNOWN') {
                state.currentHighlightedReg = item.reg;
                state.currentHighlightedPairs = [];
            } else {
                state.currentHighlightedReg = null;
                let pairsToHighlight = [item.id];
                if (item.pairId) pairsToHighlight.push(item.pairId);
                state.currentHighlightedPairs = pairsToHighlight;
            }
            
            updateItemClasses(); 
            if(onOpenEdit) onOpenEdit(selectedId);
        } else {
            state.currentHighlightedReg = null;
            state.currentHighlightedPairs = [];
            updateItemClasses();
            if(onCloseEdit) onCloseEdit();
        }
    });

    const containerReg = document.getElementById('visualizationReg');
    const optionsReg = {
        locale: 'en', groupOrder: 'order', orientation: 'top', editable: false, stack: false,
        margin: { item: { horizontal: 15, vertical: 12 }, axis: 6 },
        moment: function(date) { return document.getElementById('chkRegUTC').checked ? vis.moment(date).utc() : vis.moment(date); },
        template: function(item) { return item.isMainBar ? '' : (item.isLabel ? item.content : ''); }
    };
    if (timelineReg) timelineReg.destroy();
    timelineReg = new vis.Timeline(containerReg, itemsDataSetReg, groupsDataSetReg, optionsReg);

    timelineReg.on('select', function(properties) {
        if (properties.items.length > 0) {
            const itemId = properties.items[0];
            let item = itemsDataSetReg.get(itemId);
            if (item.isLabel) {
                timelineReg.setSelection([item.mainBarId]);
                item = itemsDataSetReg.get(item.mainBarId);
            }
            showRegDetail(item);
        } else {
            document.getElementById('regDetailPanel').style.display = 'none';
        }
    });
}

export function hardResetRegChart() {
    try {
        if (timelineReg) timelineReg.destroy(); 
        if (groupsDataSetReg.length === 0) {
            const groupsRegData = CONFIG.AIRCRAFT_REGS.map((reg, idx) => ({ id: reg, content: reg, order: idx }));
            groupsDataSetReg.add(groupsRegData);
        }
        evaluateConnections(); 

        const containerReg = document.getElementById('visualizationReg');
        const optionsReg = {
            locale: 'en', groupOrder: 'order', orientation: 'top', editable: false, stack: false,
            margin: { item: { horizontal: 15, vertical: 12 }, axis: 12 },
            moment: function(date) { return document.getElementById('chkRegUTC').checked ? vis.moment(date).utc() : vis.moment(date); },
            template: function(item) { return item.isMainBar ? '' : (item.isLabel ? item.content : ''); }
        };
        timelineReg = new vis.Timeline(containerReg, itemsDataSetReg, groupsDataSetReg, optionsReg);

        timelineReg.on('select', function(properties) {
            if (properties.items.length > 0) {
                const itemId = properties.items[0];
                let item = itemsDataSetReg.get(itemId);
                if (item.isLabel) {
                    timelineReg.setSelection([item.mainBarId]);
                    item = itemsDataSetReg.get(item.mainBarId);
                }
                showRegDetail(item);
            } else {
                document.getElementById('regDetailPanel').style.display = 'none';
            }
        });
        
        if (timeline) timelineReg.setWindow(timeline.getWindow(), {animation: false});
    } catch (e) { console.error("Reg Chart Hard Reset Error: ", e); }
}