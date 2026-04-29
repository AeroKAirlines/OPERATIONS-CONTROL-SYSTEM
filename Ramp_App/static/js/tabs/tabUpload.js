import { handleAnalyze } from '../services/api.js';
import { itemsDataSet, groupsDataSet } from '../core/store.js';
import { initTimeline, timeline, updateItemClasses, evaluateConnections } from '../chart.js';
import { openEditPanel, closeEditPanel } from '../components/editPanel.js';

export function initUploadTab(switchTabFn) {
    const msgFileInput = document.getElementById('msgFileAnalyze');
    if (msgFileInput) {
        msgFileInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) { document.getElementById('msgTextAnalyze').value = e.target.result; };
            reader.readAsText(file, "EUC-KR"); 
            event.target.value = ''; 
        });
    }

    document.getElementById('btnProcessAnalyze').addEventListener('click', () => handleAnalyze(false, switchTabFn));
    document.getElementById('btnProcessResetAnalyze').addEventListener('click', () => {
        if(confirm("⚠️ 경고: 기존에 수동으로 수정한 모든 스케줄 정보가 삭제됩니다.\n\n정말로 데이터를 완전히 초기화하고 새로 분석하시겠습니까?")) {
            handleAnalyze(true, switchTabFn);
        }
    });

    document.getElementById('btnExport').addEventListener('click', () => {
        const rawItems = itemsDataSet.get().filter(item => !item.isLink);
        const groups = groupsDataSet.get();
        const exportObj = { groups: groups, items: rawItems };
        const dataStr = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const timeStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        const a = document.createElement('a');
        a.href = url; a.download = `주기장배정_백업_${timeStr}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedObj = JSON.parse(e.target.result);
                if (importedObj.groups && importedObj.items) {
                    groupsDataSet.clear(); itemsDataSet.clear();
                    if (!timeline) initTimeline(importedObj.groups, importedObj.items, openEditPanel, closeEditPanel);
                    else {
                        groupsDataSet.add(importedObj.groups); itemsDataSet.add(importedObj.items);
                        updateItemClasses(); evaluateConnections(); timeline.fit(); 
                    }
                    if(switchTabFn) switchTabFn('visualTab'); 
                }
            } catch(err) { alert("파일을 읽는 중 오류가 발생했습니다: " + err.message); }
            event.target.value = ''; 
        };
        reader.readAsText(file);
    });
}