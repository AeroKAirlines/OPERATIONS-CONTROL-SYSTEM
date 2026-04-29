export function formatFlight(f) {
    if (f === undefined || f === null || f === '') return '';
    let str = String(f).trim();
    
    // 숫자로만 이루어져 있으면 RF를 붙이고, 영문(TW 등)이 있으면 그대로 반환
    if (/^\d+$/.test(str)) return 'RF' + str;
    return str;
}

export function formatIsoTime(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+09:00`;
}

const IATA_MAP = {
    "나리타": "NRT", "도쿄": "NRT", "오사카": "KIX", "간사이": "KIX", "후쿠오카": "FUK", "삿포로": "CTS", "신치토세": "CTS", "나고야": "NGO", 
    "오키나와": "OKA", "히로시마": "HIJ", "오비히로": "OBO", "이바라키": "IBR", "마츠모토": "MMJ", "고치": "KCZ", "오이타": "OIT", "구마모토": "KMJ",
    "가고시마": "KOJ", "도쿠시마": "TKS", "하나마키": "HNA", "후쿠시마": "FKS", "하코다테": "HKD", "아사히카와": "AKJ",
    "칭다오": "TAO", "마카오": "MFM", "홍콩": "HKG", "옌지": "YNJ", "연길": "YNJ", "하얼빈": "HRB", "장자제": "DYG", "장가계": "DYG", "하이커우": "HAK",
    "지난": "TNA", "스좌장": "SJW", "이창": "YIH", "황산": "TXN", "구이양": "KWE", "오르도스": "DSN", "후허하오터": "HET", "후룬베이얼": "HLD",
    "타이베이": "TPE", "대만": "TPE", "가오슝": "KHH", "화롄": "HUN", "타이중": "RMQ", "클락": "CRK", "세부": "CEB", "마닐라": "MNL", "나트랑": "CXR", 
    "다낭": "DAD", "푸꾸옥": "PQC", "호치민": "SGN", "하노이": "HAN", "방콕": "BKK", "수완나품": "BKK", "돈므앙": "DMK", "비엔티안": "VTE", 
    "코타키나발루": "BKI", "싱가포르": "SIN", "제주": "CJU", "무안": "MWX", "양양": "YNY", "청주": "CJJ", "울란바토르": "UBN"
};

export function getIATA(cityStr) {
    if (!cityStr) return "";
    const match = cityStr.match(/[A-Z]{3}/);
    if (match) return match[0];
    for (let key in IATA_MAP) {
        if (cityStr.includes(key)) return IATA_MAP[key];
    }
    return cityStr; 
}