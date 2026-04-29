// 시계 업데이트 (UTC / KST)
function updateClocks() {
    const now = new Date();
    
    // ZULU (UTC)
    const utcHours = String(now.getUTCHours()).padStart(2, '0');
    const utcMinutes = String(now.getUTCMinutes()).padStart(2, '0');
    const utcSeconds = String(now.getUTCSeconds()).padStart(2, '0');
    document.getElementById('clock-utc').innerText = `${utcHours}:${utcMinutes}:${utcSeconds}Z`;

    // LOCAL (KST)
    const kstHours = String(now.getHours()).padStart(2, '0');
    const kstMinutes = String(now.getMinutes()).padStart(2, '0');
    const kstSeconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clock-kst').innerText = `${kstHours}:${kstMinutes}:${kstSeconds}L`;
}

// 1초마다 시계 업데이트
setInterval(updateClocks, 1000);
updateClocks();