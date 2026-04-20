import { timeline, timelineReg, evaluateConnections, updateItemClasses, groupsDataView, hardResetRegChart } from '../chart.js';
import { updateStandDropdowns } from '../components/editPanel.js';
import { state, itemsDataSet } from '../core/store.js';

export function initChartTab() {
    document.querySelectorAll('#displaySettings input[type="checkbox"], #displaySettings input[type="radio"]').forEach(input => {
        if (['chkHighlightReg', 'chkUTC', 'chkShowRareStands', 'chkColorizeError'].includes(input.id)) return;
        input.addEventListener('change', () => { if (timeline) timeline.redraw(); });
    });

    document.getElementById('chkUTC')?.addEventListener('change', function () {
        if (timeline) {
            timeline.setOptions({ moment: function (date) { return document.getElementById('chkUTC').checked ? vis.moment(date).utc() : vis.moment(date); } });
            timeline.redraw();
        }
    });

    document.getElementById('chkRegUTC')?.addEventListener('change', function () {
        if (timelineReg) {
            timelineReg.setOptions({ moment: function (date) { return document.getElementById('chkRegUTC').checked ? vis.moment(date).utc() : vis.moment(date); } });
            timelineReg.redraw();
        }
    });

    const chkColorize = document.getElementById('chkColorizeError');
    if (chkColorize) chkColorize.addEventListener('change', evaluateConnections);

    const chkRare = document.getElementById('chkShowRareStands');
    if (chkRare) {
        chkRare.addEventListener('change', function () {
            if (groupsDataView) groupsDataView.refresh();
            updateStandDropdowns();
        });
    }

    document.getElementById('chkHighlightReg')?.addEventListener('change', function () {
        if (!this.checked) {
            state.currentHighlightedReg = null;
            if (timeline && timeline.getSelection().length > 0) {
                const item = itemsDataSet.get(timeline.getSelection()[0]);
                let pairsToHighlight = [item.id];
                if (item.pairId) pairsToHighlight.push(item.pairId);
                state.currentHighlightedPairs = pairsToHighlight;
            } else {
                state.currentHighlightedPairs = [];
            }
        } else if (timeline && timeline.getSelection().length > 0) {
            const item = itemsDataSet.get(timeline.getSelection()[0]);
            if (item && item.isActive !== false && !item.isLink && !item.isOther && item.reg && item.reg !== 'UNKNOWN') {
                state.currentHighlightedReg = item.reg;
                state.currentHighlightedPairs = [];
            }
        }
        updateItemClasses();
    });

    const btnRefreshReg = document.getElementById('btnRefreshRegChart');
    if (btnRefreshReg) {
        btnRefreshReg.addEventListener('click', function () {
            if (typeof hardResetRegChart === 'function') hardResetRegChart();
            else { evaluateConnections(); if (timelineReg) { timelineReg.checkResize(); timelineReg.redraw(); } }
        });
    }

    // 🌟 드롭다운 토글 이벤트
    const btnVisual = document.getElementById('btnToggleVisualSettings');
    const dpVisual = document.getElementById('visualSettingsDropdown');
    if (btnVisual && dpVisual) {
        btnVisual.addEventListener('click', (e) => {
            dpVisual.style.display = dpVisual.style.display === 'none' ? 'block' : 'none';
            e.stopPropagation();
        });
    }

    const btnReg = document.getElementById('btnToggleRegSettings');
    const dpReg = document.getElementById('regSettingsDropdown');
    if (btnReg && dpReg) {
        btnReg.addEventListener('click', (e) => {
            dpReg.style.display = dpReg.style.display === 'none' ? 'block' : 'none';
            e.stopPropagation();
        });
    }

    // 🌟 바탕 화면 클릭 시 드롭다운 닫기
    document.addEventListener('click', (e) => {
        if (dpVisual && !dpVisual.contains(e.target) && e.target.id !== 'btnToggleVisualSettings') dpVisual.style.display = 'none';
        if (dpReg && !dpReg.contains(e.target) && e.target.id !== 'btnToggleRegSettings') dpReg.style.display = 'none';
    });

    const btnToggleRegDetail = document.getElementById('btnToggleRegDetail');
    const containerRegDetail = document.getElementById('regDetailContainer');
    const iconRegDetail = document.getElementById('regDetailToggleIcon');

    if (btnToggleRegDetail && containerRegDetail) {
        btnToggleRegDetail.addEventListener('click', () => {
            if (containerRegDetail.style.display === 'none') {
                containerRegDetail.style.display = 'block';
                iconRegDetail.textContent = '▼ 체류 상세 정보 패널 (클릭하여 닫기)';
            } else {
                containerRegDetail.style.display = 'none';
                iconRegDetail.textContent = '▶ 체류 상세 정보 패널 (클릭하여 열기)';
            }
        });
    }
}

