import { itemsDataSet, groupsDataSet, itemsDataSetReg, groupsDataSetReg } from '../core/store.js';
import { initTimeline, evaluateConnections, updateItemClasses, timeline } from '../chart.js';
import { openEditPanel, closeEditPanel } from '../components/editPanel.js';

export function mergeIncomingData(newItems, newGroups) {
    const existingGroupIds = groupsDataSet.getIds();
    const groupsToAdd = newGroups.filter(g => !existingGroupIds.includes(g.id));
    if (groupsToAdd.length > 0) groupsDataSet.add(groupsToAdd);

    const currentItems = itemsDataSet.get({ filter: i => i.type === 'point' && !i.isLink });
    const itemsToAdd = [];
    const itemsToUpdate = [];

    newItems.forEach(newItem => {
        const newDate = newItem.originalStart.split('T')[0]; 
        const match = currentItems.find(curr =>
            curr.flight === newItem.flight &&
            curr.flightType === newItem.flightType &&
            (curr.originalStart || curr.start).startsWith(newDate) &&
            !curr.id.startsWith('manual_') && !curr.id.startsWith('table_') 
        );

        if (match) {
            let finalStart = newItem.start; 
            let finalOriginalStart = newItem.originalStart; 
            let finalRawStand = match.isModified && match.rawStand !== match.originalRawStand ? match.rawStand : newItem.rawStand;
            let finalGroup = match.isModified && match.rawStand !== match.originalRawStand ? match.group : newItem.group;
            let finalActive = match.isActive;
            let finalReg = match.reg;

            if (newItem.isOther) finalReg = newItem.reg;
            else if (newItem.isActive === true && match.isActive === false && match.reg === 'UNKNOWN') {
                finalActive = true; finalReg = newItem.reg;
            }

            let finalContent = newItem.isOther ? newItem.flight : `${finalReg !== 'UNKNOWN' && finalActive ? finalReg : '[미배정]'} ${newItem.flight}`.trim();
            let isMod = (finalStart !== finalOriginalStart) || (finalRawStand !== newItem.originalRawStand);

            itemsToUpdate.push({
                id: match.id, start: finalStart, originalStart: finalOriginalStart,
                reg: finalReg !== 'UNKNOWN' ? finalReg : match.reg, rawStand: finalRawStand,
                originalRawStand: newItem.originalRawStand, group: finalGroup,
                city: newItem.city || match.city, isActive: finalActive, content: finalContent, isModified: isMod,
                isReqCompleted: match.isReqCompleted || false // 🌟 완료 상태 보존
            });
        } else {
            itemsToAdd.push({
                ...newItem, originalStart: newItem.originalStart, originalRawStand: newItem.rawStand,
                isModified: newItem.isModified, towOffset: 30, isReqCompleted: false
            });
        }
    });

    if (itemsToUpdate.length > 0) itemsDataSet.update(itemsToUpdate);
    if (itemsToAdd.length > 0) itemsDataSet.add(itemsToAdd);

    updateItemClasses(); evaluateConnections();
}

export async function handleAnalyze(isReset, switchTabFn) {
    const fileInput = document.getElementById('pdfFilesAnalyze');
    const textInput = document.getElementById('msgTextAnalyze').value;
    const statusDiv = document.getElementById('analyzeStatus');
    
    if (fileInput.files.length === 0 || !textInput.trim()) return alert("PDF 배정표 초안과 AAR MSG 텍스트를 모두 입력해 주세요!");
    
    statusDiv.textContent = "서버 전송 및 분석 중...";
    const formData = new FormData();
    for (let i = 0; i < fileInput.files.length; i++) formData.append('pdf_files', fileInput.files[i]);
    formData.append('msg_text', textInput);

    try {
        const response = await fetch('/ramp/api/analyze', { method: 'POST', body: formData });
        const result = await response.json();
        
        if (result.status === 'success') {
            statusDiv.textContent = "✅ 데이터 처리 완료!";
            if (!timeline || isReset) {
                if (isReset && timeline) {
                    itemsDataSet.clear(); groupsDataSet.clear();
                    itemsDataSetReg.clear(); groupsDataSetReg.clear();
                }
                initTimeline(result.data.timeline.groups, result.data.timeline.items, openEditPanel, closeEditPanel);
                if (isReset) alert("데이터가 완전히 초기화되고 새로 분석되었습니다.");
            } else {
                mergeIncomingData(result.data.timeline.items, result.data.timeline.groups);
                alert("새로운 데이터가 성공적으로 병합되었습니다.");
            }
            if(switchTabFn) switchTabFn('visualTab'); 
        } else {
            statusDiv.textContent = `❌ 에러 발생: ${result.message}`;
            alert(`분석 중 에러가 발생했습니다:\n${result.message}`);
        }
    } catch (error) { 
        statusDiv.textContent = "❌ 서버 연결 에러 발생";
        alert("서버와 통신하는 데 실패했습니다.");
    }
}