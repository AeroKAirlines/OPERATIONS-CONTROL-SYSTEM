// 🌟 로그인 세션 확인 및 로그아웃 로직 🌟
const token = localStorage.getItem('occ_token');
if (!token) {
    window.location.href = '/login';
} else {
    const userName = localStorage.getItem('occ_user') || '사용자';
    const nameEl = document.getElementById('portalUserName');
    if (nameEl) nameEl.textContent = userName;
}

const btnLogout = document.getElementById('btnPortalLogout');
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        if (confirm("로그아웃 하시겠습니까?")) {
            localStorage.removeItem('occ_token');
            localStorage.removeItem('occ_user');
            window.location.href = '/login';
        }
    });
}

// 🌟 시계 업데이트 (UTC / KST) 🌟
function updateClocks() {
    const now = new Date();

    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
    const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
    document.getElementById('clock-utc').innerText = `${utcHours}:${utcMinutes}:${utcSeconds}Z`;

    const kstHours = String(now.getHours()).padStart(2, '0');
    const kstMinutes = String(now.getMinutes()).padStart(2, '0');
    const kstSeconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock-kst').innerText = `${kstHours}:${kstMinutes}:${kstSeconds}L`;
}

setInterval(updateClocks, 1000);
updateClocks();