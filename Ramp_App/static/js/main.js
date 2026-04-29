import { initEditPanel, updateStandDropdowns } from './components/editPanel.js';
import { initUploadTab } from './tabs/tabUpload.js';
import { initScheduleTab, renderScheduleTable } from './tabs/tabSchedule.js';
import { initExportTab, renderExportTable } from './tabs/tabExport.js';
import { initChartTab } from './tabs/tabChart.js';
import { initMessageTab, renderMessageTable } from './tabs/tabMessage.js'; 
import { timeline, timelineReg } from './chart.js';

window.togglePanel = function(contentId, headerEl) {
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
        if(targetTab) targetTab.classList.add('active');
        
        const targetDiv = document.getElementById(tabId);
        if(targetDiv) {
            targetDiv.classList.add('active');
        } else {
            console.error(`HTML에서 id="${tabId}" 인 요소를 찾을 수 없습니다!`);
            return;
        }
        
        if (tabId === 'listTab') renderScheduleTable(); 
        else if (tabId === 'exportTab') renderExportTable(); 
        else if (tabId === 'msgTab') renderMessageTable(); 

        setTimeout(() => {
            if (tabId === 'visualTab' && timeline) {
                if (timelineReg) timeline.setWindow(timelineReg.getWindow(), {animation: false});
                timeline.checkResize(); timeline.redraw(); 
            }
            if (tabId === 'regChartTab' && timelineReg) {
                if (timeline) timelineReg.setWindow(timeline.getWindow(), {animation: false});
                timelineReg.checkResize(); timelineReg.redraw();
            }
        }, 100);
    } catch (e) {
        console.error("탭 전환 에러:", e);
        alert(`화면 전환 중 에러가 발생했습니다.\n${e.message}\n(F12를 눌러 Console 탭을 확인하세요.)`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateStandDropdowns();

    initEditPanel();
    initUploadTab(switchTab);
    initScheduleTab();
    initExportTab();
    initChartTab();
    initMessageTab(); 

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.getAttribute('data-target')));
    });
});