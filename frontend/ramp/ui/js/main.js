import { initEditPanel, updateStandDropdowns } from './components/editPanel.js';
import { initUploadTab } from './tabs/tabUpload.js';
import { initScheduleTab, loadAdminSchedules } from './tabs/tabSchedule.js';
import { initExportTab, renderExportTable } from './tabs/tabExport.js';
import { initChartTab } from './tabs/tabChart.js';
import { initMessageTab, renderMessageTable } from './tabs/tabMessage.js';
import { timeline, timelineReg } from './chart.js';

window.togglePanel = function (contentId, headerEl) {
    const content = document.getElementById(contentId);
    const icon = headerEl.querySelector('.toggle-icon');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) icon.textContent = '▲';
    } else {
        content.style.display = 'none';
        if (icon) icon.textContent = '▼';
    }
};

function switchTab(tabId) {
    try {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        const targetTab = document.querySelector(`.tab[data-target="${tabId}"]`);
        if (targetTab) targetTab.classList.add('active');

        const targetDiv = document.getElementById(tabId);
        if (targetDiv) {
            targetDiv.classList.add('active');
        } else {
            return;
        }

        if (tabId === 'listTab') loadAdminSchedules();
        else if (tabId === 'exportTab') renderExportTable();
        else if (tabId === 'msgTab') renderMessageTable();

        setTimeout(() => {
            if (tabId === 'visualTab' && timeline) {
                if (timelineReg) timeline.setWindow(timelineReg.getWindow(), { animation: false });
                timeline.checkResize(); timeline.redraw();
            }
            if (tabId === 'regChartTab' && timelineReg) {
                if (timeline) timelineReg.setWindow(timeline.getWindow(), { animation: false });
                timelineReg.checkResize(); timelineReg.redraw();
            }
        }, 100);
    } catch (e) {
        console.error("탭 전환 에러:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 🌟 추가된 로그인 확인 및 로그아웃 로직 🌟
    const userName = localStorage.getItem('occ_user') || '사용자';
    const nameEl = document.getElementById('rampUserName');
    if (nameEl) nameEl.textContent = userName;

    const btnLogout = document.getElementById('btnRampLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (confirm("로그아웃 하시겠습니까?")) {
                localStorage.removeItem('occ_token');
                localStorage.removeItem('occ_user');
                window.location.href = '/login';
            }
        });
    }

    // 기존 초기화 로직들
    updateStandDropdowns();
    initEditPanel();
    initUploadTab(switchTab);
    initScheduleTab();
    initExportTab();
    initChartTab();
    initMessageTab();

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 2);

    const format = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    document.getElementById('globalStartDate').value = format(today);
    document.getElementById('globalEndDate').value = format(endDate);
    document.getElementById('exportTargetDate').value = format(today);
    document.getElementById('msgTargetDate').value = format(today);

    document.getElementById('btnGlobalQuery').addEventListener('click', async () => {
        const startD = document.getElementById('globalStartDate').value;
        const endD = document.getElementById('globalEndDate').value;

        if (!startD || !endD) return alert("조회할 시작일과 종료일을 선택해주세요.");
        if (startD > endD) return alert("종료일이 시작일보다 빠를 수 없습니다.");

        const { fetchAndRenderSchedules } = await import('./services/api.js');
        await fetchAndRenderSchedules(startD, endD);

        const activeTabTarget = document.querySelector('#navLive .tab.active').getAttribute('data-target');
        switchTab(activeTabTarget);

        alert(`${startD} ~ ${endD} 기간의 DB 조회가 완료되었습니다.`);
    });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.getAttribute('data-target')));
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            const mode = e.target.getAttribute('data-mode');
            if (mode === 'live') {
                document.getElementById('navLive').style.display = 'flex';
                document.getElementById('navAdmin').style.display = 'none';
                switchTab('visualTab');
            } else {
                document.getElementById('navLive').style.display = 'none';
                document.getElementById('navAdmin').style.display = 'flex';
                switchTab('inputTab');
            }
        });
    });

    switchTab('visualTab');
});