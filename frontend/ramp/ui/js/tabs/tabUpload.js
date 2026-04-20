import { fetchWithAuth } from '../services/api.js'; // 🌟 인증 통신 추가

let currentHistoryPage = 1;

export async function loadUploadHistory(page = 1) {
    currentHistoryPage = page;
    const tbody = document.querySelector('#historyTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="color:#64748b; text-align:center;">데이터를 불러오는 중입니다...</td></tr>';

    try {
        // 🌟 fetchWithAuth 적용
        const res = await fetchWithAuth(`/ramp/api/upload_history?page=${page}&limit=10`);
        const result = await res.json();

        if (result.status === 'success') {
            tbody.innerHTML = '';

            if (result.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="color:#64748b; text-align:center;">아직 업로드된 이력이 없습니다.</td></tr>';
                document.getElementById('historyPageInfo').textContent = `1 / 1`;
                document.getElementById('btnPrevHistory').disabled = true;
                document.getElementById('btnNextHistory').disabled = true;
                return;
            }

            result.data.forEach(h => {
                const badge = h.file_type === 'PDF'
                    ? '<span style="background:#142a59; color:white; padding:3px 6px; border-radius:4px; font-size:11px; font-weight:bold;">PDF</span>'
                    : '<span style="background:#fca311; color:white; padding:3px 6px; border-radius:4px; font-size:11px; font-weight:bold;">AAR</span>';

                tbody.innerHTML += `
                    <tr>
                        <td style="text-align:center;">${badge}</td>
                        <td style="font-weight:bold; color:#334155; text-align:center;">${h.target_start_date} ~ ${h.target_end_date}</td>
                        <td style="text-align:center;">${h.uploader}</td>
                        <td style="color:#d63384; font-weight:bold; text-align:center;">${h.uploaded_at}</td>
                    </tr>
                `;
            });

            const pageInfo = document.getElementById('historyPageInfo');
            const btnPrev = document.getElementById('btnPrevHistory');
            const btnNext = document.getElementById('btnNextHistory');

            if (pageInfo) pageInfo.textContent = `${result.current_page} / ${result.total_pages}`;
            if (btnPrev) btnPrev.disabled = result.current_page <= 1;
            if (btnNext) btnNext.disabled = result.current_page >= result.total_pages;

        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">이력을 불러오지 못했습니다.</td></tr>';
    }
}

export function initUploadTab() {
    loadUploadHistory(1);

    document.getElementById('btnRefreshHistory')?.addEventListener('click', () => loadUploadHistory(1));
    document.getElementById('btnPrevHistory')?.addEventListener('click', () => {
        if (currentHistoryPage > 1) loadUploadHistory(currentHistoryPage - 1);
    });
    document.getElementById('btnNextHistory')?.addEventListener('click', () => {
        loadUploadHistory(currentHistoryPage + 1);
    });

    const msgFileInput = document.getElementById('msgFileOnly');
    if (msgFileInput) {
        msgFileInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (e) { document.getElementById('msgTextOnly').value = e.target.result; };
            reader.readAsText(file, "EUC-KR");
            event.target.value = '';
        });
    }

    document.getElementById('btnUploadPdf')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('pdfFilesOnly');
        if (!fileInput || fileInput.files.length === 0) return alert("업로드할 PDF 파일을 선택해 주세요.");

        const btn = document.getElementById('btnUploadPdf');
        btn.textContent = "저장 중..."; btn.disabled = true;

        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) formData.append('pdf_files', fileInput.files[i]);
        // uploader 파라미터는 백엔드에서 처리하므로 제외

        try {
            // 🌟 fetchWithAuth 적용
            const res = await fetchWithAuth('/ramp/api/upload_pdf', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.status === 'success') {
                alert(`✅ [PDF 업로드 성공]\n${result.message}`);
                loadUploadHistory(1);
            } else {
                alert(`❌ [오류]\n${result.message}`);
            }
        } catch (e) { alert("서버 통신 오류가 발생했습니다."); console.error(e); }

        btn.textContent = "PDF 데이터 서버에 저장"; btn.disabled = false;
    });

    document.getElementById('btnUploadAar')?.addEventListener('click', async () => {
        const textInput = document.getElementById('msgTextOnly')?.value;
        if (!textInput || !textInput.trim()) return alert("AAR MSG 전문을 입력해 주세요.");

        const btn = document.getElementById('btnUploadAar');
        btn.textContent = "저장 중..."; btn.disabled = true;

        const formData = new FormData();
        formData.append('msg_text', textInput);
        // uploader 제외

        try {
            // 🌟 fetchWithAuth 적용
            const res = await fetchWithAuth('/ramp/api/upload_aar', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.status === 'success') {
                alert(`✅[AAR 업로드 성공]\n${result.message}`);
                document.getElementById('msgTextOnly').value = "";
                loadUploadHistory(1);
            } else {
                alert(`❌ [오류]\n${result.message}`);
            }
        } catch (e) { alert("서버 통신 오류가 발생했습니다."); console.error(e); }

        btn.textContent = "AAR 데이터 서버에 저장"; btn.disabled = false;
    });
}