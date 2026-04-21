// dashboard_map.js

let map;
let markers = {}; 
let routeLines = {}; 
let trackLines = {}; 
let fixMarkers = {}; // 추가: Fix 마커 저장용 객체
let acarsMarkers = {}; // 추가: ACARS 마커 저장용 객체
let cfdMarkers = {}; // 추가: CFD 마커 저장용 객체
let labelMarkers = {}; // 추가: Data Block 마커
let leaderLines = {};  // 추가: Data Block 지시선
let labelPixelOffsets = {}; // 추가: Data Block 오프셋 저장용

// 🌟 지도 필터 및 토글 상태 관리
let mapFilterState = {
    showFixes: false,
    fixName: true,
    fixEfob: true,
    fixTime: true,
    fixAlt: true,
    showAcars: false,
    acarsFob: true,
    acarsTime: true,
    acarsAlt: true,
    acarsSpeed: true,
    showCfd: true,
    acTooltipAlways: true,
    hiddenFlights: new Set() // 숨길 flight_id 모음
};
let openedDataBlocks = new Set(); // 개별적으로 열린 Data Block의 flight_id 모음

function setupMapControls() {
    const mapLayerControl = document.getElementById('map-layer-control');
    const mapControls = document.getElementById('map-controls');
    const btnLayerToggle = document.getElementById('btn-layer-toggle');

    if (mapLayerControl && typeof L !== 'undefined') {
        // 지도 위 컨트롤 패널 이벤트 버블링 방지 (클릭 안먹히는 현상 방지)
        L.DomEvent.disableClickPropagation(mapLayerControl);
        L.DomEvent.disableScrollPropagation(mapLayerControl);
    }

    if (btnLayerToggle && mapControls) {
        btnLayerToggle.addEventListener('click', () => {
            if (mapControls.style.display === 'none') {
                mapControls.style.display = 'flex';
                btnLayerToggle.style.backgroundColor = '#1e3b7a';
            } else {
                mapControls.style.display = 'none';
                btnLayerToggle.style.backgroundColor = 'rgba(11, 26, 46, 0.85)';
            }
        });
    }

    const elFixMaster = document.getElementById('toggle-fix-master');
    const elFixName = document.getElementById('toggle-fix-name');
    const elFixEfob = document.getElementById('toggle-fix-efob');
    const elFixTime = document.getElementById('toggle-fix-time');
    const elFixAlt = document.getElementById('toggle-fix-alt');
    const elAcTooltip = document.getElementById('toggle-ac-tooltip');

    const elAcarsMaster = document.getElementById('toggle-acars-master');
    const elAcarsFob = document.getElementById('toggle-acars-fob');
    const elAcarsTime = document.getElementById('toggle-acars-time');
    const elAcarsAlt = document.getElementById('toggle-acars-alt');
    const elAcarsSpeed = document.getElementById('toggle-acars-speed');
    const elToggleCfd = document.getElementById('toggle-cfd-alerts');

    if (elFixMaster) {
        // 초기 상태 설정
        mapFilterState.showFixes = elFixMaster.checked;
        if (elFixName) elFixName.disabled = !elFixMaster.checked;
        if (elFixEfob) elFixEfob.disabled = !elFixMaster.checked;
        if (elFixTime) elFixTime.disabled = !elFixMaster.checked;
        if (elFixAlt) elFixAlt.disabled = !elFixMaster.checked;
        
        const childrenContainer = elFixName ? elFixName.closest('div') : null;
        if (childrenContainer) {
            childrenContainer.style.opacity = elFixMaster.checked ? '1' : '0.4';
            childrenContainer.style.pointerEvents = elFixMaster.checked ? 'auto' : 'none';
        }

        elFixMaster.addEventListener('change', e => { 
            mapFilterState.showFixes = e.target.checked; 
            if (elFixName) elFixName.disabled = !e.target.checked;
            if (elFixEfob) elFixEfob.disabled = !e.target.checked;
            if (elFixTime) elFixTime.disabled = !e.target.checked;
            if (elFixAlt) elFixAlt.disabled = !e.target.checked;
            
            // 시각적 효과를 위해 opacity 조절
            const childrenContainer = elFixName ? elFixName.closest('div') : null;
            if (childrenContainer) {
                childrenContainer.style.opacity = e.target.checked ? '1' : '0.4';
                childrenContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';
            }
            refreshMapDisplay(); 
        });
    }
    
    if (elFixName) elFixName.addEventListener('change', e => { mapFilterState.fixName = e.target.checked; refreshMapDisplay(); });
    if (elFixEfob) elFixEfob.addEventListener('change', e => { mapFilterState.fixEfob = e.target.checked; refreshMapDisplay(); });
    if (elFixTime) elFixTime.addEventListener('change', e => { mapFilterState.fixTime = e.target.checked; refreshMapDisplay(); });
    if (elFixAlt) elFixAlt.addEventListener('change', e => { mapFilterState.fixAlt = e.target.checked; refreshMapDisplay(); });

    if (elAcarsMaster) {
        // 초기 상태 설정
        mapFilterState.showAcars = elAcarsMaster.checked;
        if (elAcarsFob) elAcarsFob.disabled = !elAcarsMaster.checked;
        if (elAcarsTime) elAcarsTime.disabled = !elAcarsMaster.checked;
        if (elAcarsAlt) elAcarsAlt.disabled = !elAcarsMaster.checked;
        if (elAcarsSpeed) elAcarsSpeed.disabled = !elAcarsMaster.checked;
        
        const childrenContainer = elAcarsFob ? elAcarsFob.closest('div') : null;
        if (childrenContainer) {
            childrenContainer.style.opacity = elAcarsMaster.checked ? '1' : '0.4';
            childrenContainer.style.pointerEvents = elAcarsMaster.checked ? 'auto' : 'none';
        }

        elAcarsMaster.addEventListener('change', e => { 
            mapFilterState.showAcars = e.target.checked; 
            if (elAcarsFob) elAcarsFob.disabled = !e.target.checked;
            if (elAcarsTime) elAcarsTime.disabled = !e.target.checked;
            if (elAcarsAlt) elAcarsAlt.disabled = !e.target.checked;
            if (elAcarsSpeed) elAcarsSpeed.disabled = !e.target.checked;
            
            // 시각적 효과를 위해 opacity 조절
            const childrenContainer = elAcarsFob ? elAcarsFob.closest('div') : null;
            if (childrenContainer) {
                childrenContainer.style.opacity = e.target.checked ? '1' : '0.4';
                childrenContainer.style.pointerEvents = e.target.checked ? 'auto' : 'none';
            }
            refreshMapDisplay(); 
        });
    }

    if (elAcarsFob) elAcarsFob.addEventListener('change', e => { mapFilterState.acarsFob = e.target.checked; refreshMapDisplay(); });
    if (elAcarsTime) elAcarsTime.addEventListener('change', e => { mapFilterState.acarsTime = e.target.checked; refreshMapDisplay(); });
    if (elAcarsAlt) elAcarsAlt.addEventListener('change', e => { mapFilterState.acarsAlt = e.target.checked; refreshMapDisplay(); });
    if (elAcarsSpeed) elAcarsSpeed.addEventListener('change', e => { mapFilterState.acarsSpeed = e.target.checked; refreshMapDisplay(); });

    if (elAcTooltip) elAcTooltip.addEventListener('change', e => { mapFilterState.acTooltipAlways = e.target.checked; refreshMapDisplay(); });

    if (elToggleCfd) {
        mapFilterState.showCfd = elToggleCfd.checked;
        elToggleCfd.addEventListener('change', e => { mapFilterState.showCfd = e.target.checked; refreshMapDisplay(); });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupMapControls();
});

function refreshMapDisplay() {
    if (typeof window.currentFlights !== 'undefined' && typeof window.currentPositions !== 'undefined') {
        updateMap(window.currentFlights, window.currentPositions, window.currentCfdMessages || []);
    }
}

// 광범위한 취항지 공항 좌표는 이제 /api/config.js (window.airportCoords) 에서 불러옵니다.

function initMap() {
    map = L.map('map').setView([33.5, 125.0], 5); 

    // 1. 다크 지도 (CARTO) - 지형만
    const darkBase = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd', minZoom: 4, maxZoom: 10
    });
    // 1-1. 다크 지도 - 라벨(지명)만
    const darkLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', minZoom: 4, maxZoom: 10
    });

    // 2. 라이트 지도 (CARTO) - 지형만
    const lightBase = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd', minZoom: 4, maxZoom: 10
    });
    // 2-1. 라이트 지도 - 라벨(지명)만
    const lightLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', minZoom: 4, maxZoom: 10
    });

    // 3. 일반 지도 (Carto Voyager) - 지형만 (OpenStreetMap 디자인 유사)
    const normalBase = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd', minZoom: 4, maxZoom: 10
    });
    // 3-1. 일반 지도 - 라벨(지명)만
    const normalLabels = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', minZoom: 4, maxZoom: 10
    });

    // 4. 지형도 (Stadia Stamen Terrain) - 해상도가 높고 깔끔한 음영 지형도 (라벨 없음)
    const topoBase = L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; Stadia Maps &copy; Stamen Design',
        subdomains: 'abcd', minZoom: 4, maxZoom: 18
    });
    // 4-1. 지형도 라벨 (Esri Reference Layer)
    const topoLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 4, maxZoom: 13
    });

    // 4-2. 지형도 (OpenTopoMap) - 고도별 색상과 등고선이 있으나 지명이 많은 지형도
    const topoColorBase = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenTopoMap',
        subdomains: 'abc', minZoom: 4, maxZoom: 17
    });
    const topoColorLabels = L.layerGroup(); // OpenTopoMap은 라벨이 내장되어 있어 빈 레이어 사용

    // 5. 위성 지도 (Esri) - 지형만 (원래 라벨 없음)
    const satelliteBase = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        minZoom: 4, maxZoom: 10
    });
    // 5-1. 위성 지도 - 라벨(경계선 및 지명)만 (Esri Reference Layer)
    const satelliteLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        minZoom: 4, maxZoom: 10
    });

    // 레이어 관리 객체
    const baseLayers = {
        "dark": darkBase,
        "light": lightBase,
        "normal": normalBase,
        "topo": topoBase,
        "topo_color": topoColorBase,
        "satellite": satelliteBase
    };

    const labelLayers = {
        "dark": darkLabels,
        "light": lightLabels,
        "normal": normalLabels,
        "topo": topoLabels,
        "topo_color": topoColorLabels,
        "satellite": satelliteLabels
    };

    let currentStyle = "dark";
    let showLabels = true;

    // 기본 지도 렌더링
    darkBase.addTo(map);
    darkLabels.addTo(map);

    // 스타일 변경 이벤트
    const mapStyleSelect = document.getElementById('dashboard-map-style');
    if (mapStyleSelect) {
        mapStyleSelect.addEventListener('change', (e) => {
            currentStyle = e.target.value;
            updateMapStyle();
        });
    }

    // 라벨 표시/숨김 이벤트
    const toggleLabels = document.getElementById('toggle-map-labels');
    if (toggleLabels) {
        toggleLabels.addEventListener('change', (e) => {
            showLabels = e.target.checked;
            updateMapStyle();
        });
    }

    function updateMapStyle() {
        // 기존 모든 지형/라벨 지도 제거
        Object.values(baseLayers).forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));
        Object.values(labelLayers).forEach(layer => map.hasLayer(layer) && map.removeLayer(layer));

        // 지형(베이스) 렌더링
        const selectedBase = baseLayers[currentStyle];
        if (selectedBase) {
            selectedBase.addTo(map);
            
            // 라벨(오버레이) 렌더링 (켜져있을 경우만)
            if (showLabels) {
                const selectedLabel = labelLayers[currentStyle];
                if (selectedLabel) {
                    selectedLabel.addTo(map);
                }
            }
        }
    }

    // 줌 레벨 변경 시 Data Block의 픽셀 오프셋을 유지하도록 위치 재계산
    map.on('zoomend', function() {
        Object.keys(markers).forEach(fId => {
            if (labelMarkers[fId] && markers[fId] && labelPixelOffsets[fId]) {
                let acPt = map.latLngToLayerPoint(markers[fId].getLatLng());
                let newLabelLatLng = map.layerPointToLatLng(acPt.add(labelPixelOffsets[fId]));
                labelMarkers[fId].setLatLng(newLabelLatLng);
                if (leaderLines[fId]) {
                    leaderLines[fId].setLatLngs([markers[fId].getLatLng(), newLabelLatLng]);
                }
            }
        });
    });
}

function parseCoordinate(coordStr) {
    if (!coordStr) return null;
    try {
        coordStr = coordStr.toString().replace(/\s+/g, '').toUpperCase();
        const dir = coordStr.charAt(0);
        
        // 백엔드에서 넘어온 십진수 좌표계(DD)인 경우 (숫자나 -로 시작)
        if (!['N', 'S', 'E', 'W'].includes(dir)) {
            const val = parseFloat(coordStr);
            return isNaN(val) ? null : val;
        }
        
        // 기존 N/E/S/W 포맷 처리
        const isNeg = (dir === 'S' || dir === 'W');
        if (coordStr.indexOf('.') === 3 || coordStr.indexOf('.') === 4) {
            let val = parseFloat(coordStr.substring(1));
            return isNeg ? -val : val;
        }
        let degLen = (dir === 'N' || dir === 'S') ? 2 : 3;
        let deg = parseFloat(coordStr.substring(1, 1 + degLen));
        let minStr = coordStr.substring(1 + degLen);
        if (!minStr) return isNeg ? -deg : deg;
        let min = minStr.includes('.') ? parseFloat(minStr) : parseFloat(minStr) / 10;
        return isNeg ? -(deg + min / 60) : (deg + min / 60);
    } catch(e) { return null; }
}

function parseAcarsDate(timeRaw, flightInfo) {
    if (!timeRaw) return null;
    let takeOffStr = flightInfo ? (flightInfo.off_time_z || flightInfo.off_time || flightInfo.atd_z || flightInfo.atd) : null;
    
    if (timeRaw.includes('/')) {
        const parts = timeRaw.split('/');
        const timePart = parts[0];
        const dayPart = parts[1];
        if (timePart.length === 4) {
            if (takeOffStr && typeof getFlightDate === 'function') {
                let takeOffDate = getFlightDate(flightInfo, takeOffStr);
                let acarsDate = new Date(takeOffDate.getTime());
                acarsDate.setUTCHours(parseInt(timePart.substring(0, 2), 10), parseInt(timePart.substring(2, 4), 10), 0, 0);
                if (!isNaN(parseInt(dayPart, 10))) {
                     acarsDate.setUTCDate(parseInt(dayPart, 10));
                }
                if (acarsDate < takeOffDate && parseInt(dayPart, 10) < takeOffDate.getUTCDate()) {
                     acarsDate.setUTCMonth(acarsDate.getUTCMonth() + 1);
                }
                return acarsDate;
            }
        }
    } else {
        let d = new Date(timeRaw);
        if (!isNaN(d.getTime())) return d;
    }
    return null;
}

function getInterpolatedPosition(track, targetDate, flightInfo) {
    if (!track || track.length === 0 || !targetDate) return null;
    const tTarget = targetDate.getTime();
    
    let beforePt = null;
    let afterPt = null;
    let tBefore = 0;
    let tAfter = 0;
    
    for (let i = 0; i < track.length; i++) {
        let ptTimeRaw = track[i].posData.report_time || track[i].posData.created_at;
        let ptDate = parseAcarsDate(ptTimeRaw, flightInfo);
        if (!ptDate) continue;
        let tPt = ptDate.getTime();
        
        if (tPt <= tTarget) {
            if (!beforePt || tPt > tBefore) {
                beforePt = track[i];
                tBefore = tPt;
            }
        } else if (tPt > tTarget) {
            if (!afterPt || tPt < tAfter) {
                afterPt = track[i];
                tAfter = tPt;
            }
        }
    }
    
    if (beforePt && afterPt) {
        let ratio = (tTarget - tBefore) / (tAfter - tBefore);
        if (ratio < 0) ratio = 0;
        if (ratio > 1) ratio = 1;
        let lat = beforePt.lat + (afterPt.lat - beforePt.lat) * ratio;
        let lon = beforePt.lon + (afterPt.lon - beforePt.lon) * ratio;
        return {lat, lon};
    } else if (beforePt) {
        return {lat: beforePt.lat, lon: beforePt.lon};
    } else if (afterPt) {
        return {lat: afterPt.lat, lon: afterPt.lon};
    }
    return null;
}

function calculateAngle(lat1, lon1, lat2, lon2) {
    const dy = lat2 - lat1;
    const dx = Math.cos(Math.PI / 180 * lat1) * (lon2 - lon1);
    return Math.atan2(dx, dy) * 180 / Math.PI;
}

function updateMap(flights, positions, cfdMessages = []) {
    const flightTracks = {};
    const flightCfds = {};
    
    cfdMessages.forEach(c => {
        if (!flightCfds[c.flight_id]) flightCfds[c.flight_id] = [];
        flightCfds[c.flight_id].push(c);
    });
    
    // ACARS 궤적 그룹화를 오직 고유 ID(flight_id)로 묶어서 어제 비행과 오늘 비행이 섞이지 않도록 차단
    positions.forEach(pos => {
        if (!pos.flight_id) return;
        
        let latStr = pos.lat; let lonStr = pos.lon;
        if (!latStr || !lonStr) {
            let m = (pos.pos || "").match(/([NS][\d.]+)([EW][\d.]+)/);
            if (m) { latStr = m[1]; lonStr = m[2]; }
        }
        const lat = parseCoordinate(latStr);
        const lon = parseCoordinate(lonStr);
        if (lat && lon) {
            if (!flightTracks[pos.flight_id]) flightTracks[pos.flight_id] = [];
            flightTracks[pos.flight_id].push({lat, lon, posData: pos});
        }
    });

    const NOW = new Date();
    const activeMapFlights = new Set(); // 렌더링 대상 fId 저장

    // 오직 마스터 스케줄(Dashboard)에 존재하는 녀석들만 지도로 그림! (야생 데이터 금지)
    flights.forEach(f => {
        const fId = f.id; // 예: 2026-04-16_EOK609
        const fNum = f.flight_number;
        const status = f.status || 'SCHED';

        // 1. ARRIVED (IN 수신): 묻지도 따지지도 않고 지도에서 삭제
        if (status === 'ARRIVED') return; 

        // 2. 비상 종료: ETA(또는 ON) 기준 30분 초과 시 강제 삭제
        let ofp = Array.isArray(f.ofp_data) ? f.ofp_data[f.ofp_data.length-1] : f.ofp_data;
        let refTimeStr = f.on_time_z || f.eta_z || (ofp && ofp.eta) || f.sta_z;
        // getFlightDate는 operation_dashboard.js에 있음 (전역 공유됨)
        let refDate = typeof getFlightDate === 'function' ? getFlightDate(f, refTimeStr) : null;
        if (refDate && (NOW.getTime() - refDate.getTime()) / 60000 > 30) return;

        let track = flightTracks[fId] ||[];
        track.reverse();

        let drawLat, drawLon, popupData;

        // 3. Status 기반 렌더링 로직 (요청사항 완벽 적용)
        if (status === 'SCHED') {
            if (track.length === 0) return; // 위치데이터가 없으면 안그림
            drawLat = track[track.length-1].lat;
            drawLon = track[track.length-1].lon;
            popupData = track[track.length-1].posData;
        } 
        else if (status === 'DEPARTED' || status === 'AIRBORNE') {
            if (track.length > 0) {
                drawLat = track[track.length-1].lat;
                drawLon = track[track.length-1].lon;
                popupData = track[track.length-1].posData;
            } else {
                // OUT 보정 (위치 없음) -> 무조건 출발공항
                if (airportCoords[f.dep_airport]) {
                    drawLat = airportCoords[f.dep_airport][0];
                    drawLon = airportCoords[f.dep_airport][1];
                    popupData = { flight_number: fNum, aircraft_reg: f.aircraft_reg, alt: 'GND', mch: '-', fob: f.out_fob || '-' };
                } else return;
            }
        } 
        else if (status === 'LANDED') {
            // ON 보정 -> 무조건 도착공항 (위치데이터 씹음)
            if (airportCoords[f.arr_airport]) {
                drawLat = airportCoords[f.arr_airport][0];
                drawLon = airportCoords[f.arr_airport][1];
                popupData = { flight_number: fNum, aircraft_reg: f.aircraft_reg, alt: 'GND', mch: '-', fob: f.on_fob || '-' };
            } else return;
        }

        // 항공편이 토글에서 꺼져있으면 그리지 않음 (UI에는 추가해야 함)
        activeMapFlights.add(fId);
        
        const isHidden = mapFilterState.hiddenFlights.has(fId);

        // 4. 공항 + OFP 항로 이어서 그리기
        let plannedRouteCoords =[];
        let routeFixes = []; // Fix 정보 저장용 배열
        let depC = airportCoords[f.dep_airport];
        let arrC = airportCoords[f.arr_airport];

        if (depC) plannedRouteCoords.push(depC); // 첫 Fix: 출발 공항

        if (ofp && ofp.route_data) {
            ofp.route_data.forEach(p => {
                let rLat = parseCoordinate(p.lat);
                let rLng = parseCoordinate(p.long);
                // 비정상적인 좌표(에러 파싱) 튕겨내기 필터 (동아시아 및 주요 운항 노선 구역 한정)
                if (rLat && rLng && rLat > 0 && rLat < 60 && rLng > 90 && rLng < 150) {
                    plannedRouteCoords.push([rLat, rLng]);
                    if (!isHidden) {
                        routeFixes.push({lat: rLat, lng: rLng, data: p});
                    }
                }
            });
        }
        if (arrC) plannedRouteCoords.push(arrC); // 끝 Fix: 도착 공항

        // 항로 데이터가 비어있으면 심플 직선
        if (plannedRouteCoords.length < 2 && depC && arrC) {
            plannedRouteCoords = [depC, arrC];
        }

        // 5. 기수(방향) 계산
        let angle = 0;
        if (status === 'LANDED' && track.length > 0) {
            angle = calculateAngle(track[track.length-1].lat, track[track.length-1].lon, drawLat, drawLon);
        } else if (track.length > 1) {
            angle = calculateAngle(track[track.length-2].lat, track[track.length-2].lon, drawLat, drawLon);
        } else if (track.length === 1 && depC) {
            angle = calculateAngle(depC[0], depC[1], drawLat, drawLon);
        } else if (plannedRouteCoords.length > 1) {
            angle = calculateAngle(plannedRouteCoords[0][0], plannedRouteCoords[0][1], plannedRouteCoords[1][0], plannedRouteCoords[1][1]);
        }

        let cfds = flightCfds[fId] || [];
        renderSingleFlightMarkerAndLines(fId, fNum, drawLat, drawLon, angle, track, plannedRouteCoords, popupData, depC, routeFixes, f, cfds, NOW);
    });

    updateFlightTogglesUI(activeMapFlights, flights);

    // 삭제 대상 지우개 (fId 기준 완전 초기화)
    Object.keys(markers).forEach(fId => {
        if (!activeMapFlights.has(fId)) {
            if (markers[fId]) { map.removeLayer(markers[fId]); delete markers[fId]; }
            if (trackLines[fId]) { map.removeLayer(trackLines[fId]); delete trackLines[fId]; }
            if (routeLines[fId]) { map.removeLayer(routeLines[fId]); delete routeLines[fId]; }
            if (fixMarkers[fId]) {
                fixMarkers[fId].forEach(m => map.removeLayer(m));
                delete fixMarkers[fId];
            }
            if (acarsMarkers[fId]) {
                acarsMarkers[fId].forEach(m => map.removeLayer(m));
                delete acarsMarkers[fId];
            }
            if (cfdMarkers[fId]) {
                cfdMarkers[fId].forEach(m => map.removeLayer(m));
                delete cfdMarkers[fId];
            }
            if (labelMarkers[fId]) { map.removeLayer(labelMarkers[fId]); delete labelMarkers[fId]; }
            if (leaderLines[fId]) { map.removeLayer(leaderLines[fId]); delete leaderLines[fId]; }
            delete labelPixelOffsets[fId];
        }
    });
}

function updateFlightTogglesUI(activeMapFlights, flights) {
    const container = document.getElementById('flight-toggles-container');
    if (!container) return;

    // 현재 지도에 그릴 대상인 fId들 목록
    const activeArr = Array.from(activeMapFlights);
    
    // UI 초기화 및 재생성 (간단하게)
    container.innerHTML = '';
    
    activeArr.forEach(fId => {
        const flight = flights.find(f => f.id === fId);
        if (!flight) return;
        
        const isHidden = mapFilterState.hiddenFlights.has(fId);
        
        const label = document.createElement('label');
        label.className = 'custom-checkbox-label';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !isHidden;
        cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                mapFilterState.hiddenFlights.delete(fId);
            } else {
                mapFilterState.hiddenFlights.add(fId);
            }
            refreshMapDisplay();
        });
        
        const checkmark = document.createElement('span');
        checkmark.className = 'checkmark';
        
        const labelText = document.createElement('span');
        labelText.className = 'label-text';
        labelText.textContent = flight.flight_number;

        label.appendChild(cb);
        label.appendChild(checkmark);
        label.appendChild(labelText);
        container.appendChild(label);
    });
}

function renderSingleFlightMarkerAndLines(fId, fNum, lat, lon, angle, track, plannedRouteCoords, popupData, depC, routeFixes, flightInfo, cfds = [], NOW = new Date()) {
    if (plannedRouteCoords && plannedRouteCoords.length > 1) {
        if (routeLines[fId]) routeLines[fId].setLatLngs(plannedRouteCoords);
        else routeLines[fId] = L.polyline(plannedRouteCoords, { color: '#8b9bb4', weight: 2, dashArray: '5, 10', opacity: 0.6 }).addTo(map);
    } else {
        if (routeLines[fId]) { map.removeLayer(routeLines[fId]); delete routeLines[fId]; }
    }

    let flownLatLngs = [];
    if (depC) flownLatLngs.push(depC);
    if (track && track.length > 0) {
        flownLatLngs.push(...track.map(p => [p.lat, p.lon]));
    }
    if (flightInfo && flightInfo.status === 'LANDED' && airportCoords[flightInfo.arr_airport]) {
        flownLatLngs.push(airportCoords[flightInfo.arr_airport]);
    }

    if (track && track.length > 0 && flownLatLngs.length > 1) {
        if (trackLines[fId]) trackLines[fId].setLatLngs(flownLatLngs);
        else trackLines[fId] = L.polyline(flownLatLngs, { color: '#fca311', weight: 2, dashArray: '5, 5', opacity: 0.6 }).addTo(map);
    } else {
        if (trackLines[fId]) { map.removeLayer(trackLines[fId]); delete trackLines[fId]; }
    }

    // 🌟 Fix(Waypoint) 마커 그리기
    if (fixMarkers[fId]) {
        fixMarkers[fId].forEach(m => map.removeLayer(m));
    }
    fixMarkers[fId] = [];

    if (mapFilterState.showFixes && routeFixes && routeFixes.length > 0) {
        routeFixes.forEach((fix, idx) => {
            // Fix 데이터에서 속성 추출 (백엔드에서 'wpt' 키로 전송됨)
            const p = fix.data;
            const name = p.wpt || p.name || p.ident || p.waypoint || p.id || '';
            const efob = p.efob || p.rem_fuel || '';
            const time = p.tot_t || p.time || '';
            const altRaw = p.fl || p.alt || '';

            // 고도 FL 표기 변환: FL이 안붙어있고, 특정 고도 이상이면 FL 붙임 (클라임/디센트는 FL 떼고)
            // 보통 140 이상이면 FL, 그 이하면 ft, 하지만 백엔드에서 주는 데이터 기반으로 판단
            let altDisplay = altRaw.toString();
            if (altDisplay && !altDisplay.startsWith('FL') && parseInt(altDisplay) >= 140) {
                altDisplay = 'FL' + altDisplay;
            }

            let labels = [];
            if (mapFilterState.fixName && name) labels.push(`<div style="color: #4ade80; font-weight: 800; font-size: 11px;">${name}</div>`);
            if (mapFilterState.fixEfob && efob) labels.push(`<div style="color: #fca311; font-size: 10px; font-weight: 600;">EFOB:${efob}</div>`);
            if (mapFilterState.fixTime && time) labels.push(`<div style="color: #60a5fa; font-size: 10px; font-weight: 600;">T:${time}</div>`);
            if (mapFilterState.fixAlt && altDisplay) labels.push(`<div style="color: #f472b6; font-size: 10px; font-weight: 600;">${altDisplay}</div>`);

            let labelHtml = '';
            if (labels.length > 0) {
                labelHtml = `<div style="font-family: 'Inter', sans-serif; line-height: 1.1; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 2px 2px rgba(0,0,0,0.8); padding-left: 6px;">
                    ${labels.join('')}
                </div>`;
            }
            
            const dotIcon = L.divIcon({
                html: `<div style="position: absolute; display: flex; flex-direction: column; align-items: flex-start; overflow: visible;">
                         <div style="width: 6px; height: 6px; background-color: #4ade80; transform: rotate(45deg); box-shadow: 0 0 2px #000; margin-left: 2px; margin-bottom: 2px; flex-shrink: 0;"></div>
                         <div style="white-space: nowrap; pointer-events: none;">${labelHtml}</div>
                       </div>`,
                className: '',
                iconSize: [6, 6],
                iconAnchor: [3, 3]
            });
            
            const fm = L.marker([fix.lat, fix.lng], {icon: dotIcon}).addTo(map);
            fixMarkers[fId].push(fm);
        });
    }

    // 🌟 ACARS Archive 마커 그리기
    if (acarsMarkers[fId]) {
        acarsMarkers[fId].forEach(m => map.removeLayer(m));
    }
    acarsMarkers[fId] = [];

    if (mapFilterState.showAcars && track && track.length > 0) {
        track.forEach((tPt, idx) => {
            // 마지막 위치는 항공기 아이콘이 그려지므로 생략할지 여부 고민, 여기서는 다 그려줌
            const pos = tPt.posData;
            
            let timeRaw = pos.report_time || pos.created_at || '';
            let fob = pos.fob || '';
            let altRaw = pos.alt || pos.fl || '';
            let speed = pos.mch || pos.speed || '';

            // 1. 고도 로직: FL 강제 추가 로직 제거, 기호(+,-) 제거하고 숫자만
            let altDisplay = altRaw ? altRaw.toString().replace(/^[+-]/, '') : '';

            // 2. 시간 로직: 수신 시간 및 이륙 후 경과 시간(Elapsed Time) 계산
            let takeOffStr = flightInfo ? (flightInfo.off_time_z || flightInfo.off_time || flightInfo.atd_z || flightInfo.atd) : null;
            let elapsedStr = '';
            let timeStr = '';
            let acarsDate = null;

            if (timeRaw && timeRaw.includes('/')) {
                const parts = timeRaw.split('/');
                const timePart = parts[0];
                const dayPart = parts[1];
                if (timePart.length === 4) {
                    timeStr = `${timePart.substring(0, 2)}:${timePart.substring(2, 4)}z`;
                    if (takeOffStr && typeof getFlightDate === 'function') {
                        let takeOffDate = getFlightDate(flightInfo, takeOffStr);
                        acarsDate = new Date(takeOffDate.getTime());
                        acarsDate.setUTCHours(parseInt(timePart.substring(0, 2), 10), parseInt(timePart.substring(2, 4), 10), 0, 0);
                        if (!isNaN(parseInt(dayPart, 10))) {
                             acarsDate.setUTCDate(parseInt(dayPart, 10));
                        }
                        if (acarsDate < takeOffDate && parseInt(dayPart, 10) < takeOffDate.getUTCDate()) {
                             acarsDate.setUTCMonth(acarsDate.getUTCMonth() + 1);
                        }
                    }
                } else {
                    timeStr = timeRaw;
                }
            } else if (timeRaw) {
                let d = new Date(timeRaw);
                if (!isNaN(d.getTime())) {
                    timeStr = `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}z`;
                    acarsDate = d;
                } else {
                    timeStr = timeRaw;
                }
            }

            if (takeOffStr && acarsDate && !isNaN(acarsDate.getTime()) && typeof getFlightDate === 'function') {
                let takeOffDate = getFlightDate(flightInfo, takeOffStr);
                let diffMin = Math.floor((acarsDate.getTime() - takeOffDate.getTime()) / 60000);
                if (diffMin >= 0) {
                    let h = Math.floor(diffMin / 60).toString().padStart(2, '0');
                    let m = (diffMin % 60).toString().padStart(2, '0');
                    elapsedStr = ` (${h}:${m})`;
                }
            }

            let displayTime = timeStr + elapsedStr;

            let labels = [];
            if (mapFilterState.acarsFob && fob) labels.push(`<div style="color: #fca311; font-size: 10px; font-weight: 600;">FOB:${fob}</div>`);
            if (mapFilterState.acarsTime && displayTime) labels.push(`<div style="color: #60a5fa; font-size: 10px; font-weight: 600;">T:${displayTime}</div>`);
            if (mapFilterState.acarsAlt && altDisplay) labels.push(`<div style="color: #f472b6; font-size: 10px; font-weight: 600;">${altDisplay}</div>`);
            if (mapFilterState.acarsSpeed && speed) {
                let speedStr = speed.toString().trim();
                let speedDisplay = speedStr;
                
                // pos.mch가 존재하거나 값이 500이상이거나 소수점이면 Mach로 간주
                if (pos.mch || speedStr.startsWith('.') || parseFloat(speedStr) < 2 || parseFloat(speedStr) >= 500) {
                    if (!speedStr.toUpperCase().startsWith('M')) {
                        if (parseFloat(speedStr) >= 100) {
                            speedDisplay = `M.${speedStr}`;
                        } else {
                            speedDisplay = `M${speedStr}`;
                        }
                    }
                } else {
                    speedDisplay = `${speedStr}kt`;
                }
                labels.push(`<div style="color: #a78bfa; font-size: 10px; font-weight: 600;">${speedDisplay}</div>`);
            }

            let labelHtml = '';
            if (labels.length > 0) {
                labelHtml = `<div style="font-family: 'Inter', sans-serif; line-height: 1.1; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 2px 2px rgba(0,0,0,0.8); padding-left: 6px;">
                    ${labels.join('')}
                </div>`;
            }
            
            const dotIcon = L.divIcon({
                html: `<div style="position: absolute; display: flex; flex-direction: column; align-items: flex-start; overflow: visible;">
                         <div style="width: 5px; height: 5px; background-color: #60a5fa; border-radius: 50%; box-shadow: 0 0 2px #000; margin-left: 2px; margin-bottom: 2px; flex-shrink: 0;"></div>
                         <div style="white-space: nowrap; pointer-events: none;">${labelHtml}</div>
                       </div>`,
                className: '',
                iconSize: [5, 5],
                iconAnchor: [2, 2]
            });
            
            const am = L.marker([tPt.lat, tPt.lon], {icon: dotIcon}).addTo(map);
            acarsMarkers[fId].push(am);
        });
    }

    // 🌟 CFD 마커 그리기 및 비행기 아이콘 색상 결정
    let hasActiveCfd = false;
    if (cfdMarkers[fId]) {
        cfdMarkers[fId].forEach(m => map.removeLayer(m));
    }
    cfdMarkers[fId] = [];

    if (cfds && cfds.length > 0) {
        // 그룹화: 동일한 "위치(Location)"를 가진 메시지끼리 공간 클러스터링 (반경 약 1.1km)
        let groupedCfds = {};
        
        cfds.forEach(cfd => {
            let cfdDate = parseAcarsDate(cfd.report_time, flightInfo) || new Date(cfd.created_at);
            if (cfdDate <= NOW) {
                hasActiveCfd = true;
            }
            
            if (mapFilterState.showCfd && track && track.length > 0) {
                let interpolated = getInterpolatedPosition(track, cfdDate, flightInfo);
                if (interpolated) {
                    // 소수점 2자리(약 1.1km) 격자로 묶어 지상 대기 시 겹침을 완벽히 방지
                    let locKey = `${interpolated.lat.toFixed(2)}_${interpolated.lon.toFixed(2)}`;
                    
                    if (!groupedCfds[locKey]) {
                        groupedCfds[locKey] = { lat: interpolated.lat, lon: interpolated.lon, items: [] };
                    }
                    groupedCfds[locKey].items.push({ cfd: cfd, date: cfdDate });
                }
            }
        });

        Object.values(groupedCfds).forEach(group => {
            // 시간순 정렬
            group.items.sort((a, b) => a.date.getTime() - b.date.getTime());
            
            let faultsHtml = group.items.map(item => {
                let c = item.cfd;
                let tStr = `${item.date.getUTCHours().toString().padStart(2, '0')}:${item.date.getUTCMinutes().toString().padStart(2, '0')}z`;
                return `
                    <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.15);">
                        <div style="display: flex; justify-content: space-between; align-items: baseline;">
                            <span style="color: #fca311; font-size: 10px; font-weight: 600;">${c.fault_code}</span>
                            <span style="color: #60a5fa; font-size: 9px; margin-left: 8px;">${tStr}</span>
                        </div>
                        <div style="color: #ddd; font-size: 10px; font-weight: 600; white-space: normal; max-width: 180px; line-height: 1.2; margin-top: 2px;">${c.fault_desc || ''}</div>
                    </div>
                `;
            }).join('');

            let headerTitle = group.items.length > 1 ? `[CFD ALERT] <span style="color:#fff; font-size:9px; font-weight:normal;">(${group.items.length})</span>` : `[CFD ALERT]`;

            let labelHtml = `<div style="font-family: 'Inter', sans-serif; line-height: 1.1; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 2px 2px rgba(0,0,0,0.8); padding-left: 8px; background: rgba(0,0,0,0.6); border-radius: 4px; padding: 6px; border-left: 2px solid #ef4444;">
                <div style="color: #ef4444; font-weight: 800; font-size: 11px;">${headerTitle}</div>
                ${faultsHtml}
            </div>`;
            
            const warningIcon = L.divIcon({
                html: `<div style="position: absolute; display: flex; flex-direction: row; align-items: flex-start; overflow: visible;">
                         <div style="color: #ef4444; font-size: 14px; font-weight: bold; text-shadow: 0 0 3px #000; line-height: 1; margin-top: -6px; margin-left: -5px; filter: drop-shadow(0 0 2px red);">⚠️</div>
                         <div style="white-space: nowrap; pointer-events: none; margin-left: 4px;">${labelHtml}</div>
                       </div>`,
                className: '',
                iconSize: [0, 0],
                iconAnchor: [0, 0]
            });
            
            const cm = L.marker([group.lat, group.lon], {icon: warningIcon, zIndexOffset: 2000}).addTo(map);
            cfdMarkers[fId].push(cm);
        });
    }

    // 🌟 팝업 컨텐츠 구성 (비행 시간 계산 포함)
    let currentFlightTimeStr = '-';
    let reportTimeStr = '';
    
    if (flightInfo && popupData) {
        // 순수 비행 시간(순항)은 Wheels Off(이륙) 기준
        let takeOffStr = flightInfo.off_time_z || flightInfo.off_time || flightInfo.atd_z || flightInfo.atd;
        
        let acarsDate = null;
        // ACARS report 수신 시간
        if (popupData.report_time && popupData.report_time.includes('/')) {
            const parts = popupData.report_time.split('/');
            const timePart = parts[0];
            const dayPart = parts[1];
            if (timePart.length === 4) {
                const hh = parseInt(timePart.substring(0, 2), 10);
                const mm = parseInt(timePart.substring(2, 4), 10);
                reportTimeStr = `${timePart.substring(0, 2)}:${timePart.substring(2, 4)}z`;
                
                if (takeOffStr && typeof getFlightDate === 'function') {
                    let takeOffDate = getFlightDate(flightInfo, takeOffStr);
                    acarsDate = new Date(takeOffDate.getTime());
                    acarsDate.setUTCHours(hh, mm, 0, 0);
                    
                    if (!isNaN(parseInt(dayPart, 10))) {
                         acarsDate.setUTCDate(parseInt(dayPart, 10));
                    }
                    if (acarsDate < takeOffDate && parseInt(dayPart, 10) < takeOffDate.getUTCDate()) {
                         acarsDate.setUTCMonth(acarsDate.getUTCMonth() + 1);
                    }
                }
            }
        } else if (popupData.created_at) {
            acarsDate = new Date(popupData.created_at);
            reportTimeStr = `${acarsDate.getUTCHours().toString().padStart(2, '0')}:${acarsDate.getUTCMinutes().toString().padStart(2, '0')}z`;
        }

        if (takeOffStr && typeof getFlightDate === 'function' && acarsDate && !isNaN(acarsDate.getTime())) {
            let takeOffDate = getFlightDate(flightInfo, takeOffStr);
            let diffMin = Math.floor((acarsDate.getTime() - takeOffDate.getTime()) / 60000);
            if (diffMin >= 0) {
                let h = Math.floor(diffMin / 60).toString().padStart(2, '0');
                let m = (diffMin % 60).toString().padStart(2, '0');
                currentFlightTimeStr = `${h}:${m}`;
            } else if (diffMin > -60) {
                currentFlightTimeStr = `00:00`;
            }
        }
    }

    // Mach 계산 (ATC 스타일, 예: 726 -> M.726, 0.72 -> M.720)
    let mchVal = popupData.mch;
    let mchStr = '-';
    if (mchVal && mchVal !== '-' && !isNaN(mchVal)) {
        let mNum = parseFloat(mchVal);
        if (mNum > 10) mNum = mNum / 1000;
        mchStr = 'M.' + mNum.toFixed(3).split('.')[1];
    } else if (mchVal) {
        mchStr = mchVal;
    }

    // 고도를 FL 형식으로 변환 (ATC 데이터 블록 스타일)
    let altVal = popupData.alt || '-';
    let altDisplay = altVal;
    if (altVal !== '-' && !isNaN(altVal)) {
        let altNum = parseInt(altVal, 10);
        if (altNum >= 14000) {
            altDisplay = 'FL' + Math.floor(altNum / 100).toString().padStart(3, '0');
        } else {
            altDisplay = altNum.toString();
        }
    }

    let fobStr = popupData.fob && popupData.fob !== '-' ? popupData.fob : '----';
    let timeStr = currentFlightTimeStr !== '-' ? currentFlightTimeStr : '----';

    const labelHtml = `
        <div class="radar-data-block">
            <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 3px; margin-bottom: 4px;">
                <span style="font-weight: bold; color: #fff; font-size: 12px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.5px;">${fNum}</span>
                <span style="color: #888; font-size: 9px; margin-left: 12px;">${reportTimeStr}</span>
            </div>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; font-size: 10px;">
                <span style="color: #888; font-weight: bold;">REG</span>
                <span style="color: #ddd; font-weight: bold; text-align: right;">${popupData.aircraft_reg || 'N/A'}</span>
                
                <span style="color: #888; font-weight: bold;">FOB</span>
                <span style="color: #fca311; font-weight: bold; text-align: right;">${fobStr}</span>
                
                <span style="color: #888; font-weight: bold;">TIME</span>
                <span style="color: #ddd; font-weight: bold; text-align: right;">${timeStr}</span>
                
                <span style="color: #888; font-weight: bold;">ALT</span>
                <span style="color: #ddd; font-weight: bold; text-align: right;">${altDisplay}</span>
                
                <span style="color: #888; font-weight: bold;">SPD</span>
                <span style="color: #ddd; font-weight: bold; text-align: right;">${mchStr}</span>
            </div>
        </div>
    `;
    
    // 항공기 아이콘 (데이터 블록이 꺼져있을 때만 편명 텍스트 노출)
    const isDataBlockVisible = mapFilterState.acTooltipAlways || openedDataBlocks.has(fId);
    const inlineLabelDisplay = isDataBlockVisible ? 'none' : 'block';
    
    // CFD 발생 시 붉은색(#ef4444), 평상시 기본색(#fca311 노란색)
    const planeColor = hasActiveCfd ? '%23ef4444' : '%23fca311';
    
    const planeIconHtml = `<div style="position: relative; width: 24px; height: 24px; cursor: pointer;">
             <div class="plane-icon" style="transform: rotate(${angle}deg); background-image: url('data:image/svg+xml;utf8,<svg fill=%22${planeColor}%22 viewBox=%220 0 24 24%22 xmlns=%22http://www.w3.org/2000/svg%22><path d=%22M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z%22/></svg>'); width: 24px; height: 24px; background-size: contain; background-repeat: no-repeat; filter: drop-shadow(0px 0px 3px rgba(0,0,0,0.8));"></div>
             <div class="flight-label" style="display: ${inlineLabelDisplay}; position: absolute; top: 12px; left: 24px; color: #fff; font-family: monospace; font-size: 12px; font-weight: bold; text-shadow: 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000; white-space: nowrap; pointer-events: none;">${fNum}</div>
           </div>`;
    const planeIcon = L.divIcon({ className: '', html: planeIconHtml, iconSize: [24, 24], iconAnchor:[12, 12] });

    if (markers[fId]) {
        markers[fId].setLatLng([lat, lon]);
        markers[fId].setIcon(planeIcon);
    } else {
        markers[fId] = L.marker([lat, lon], {icon: planeIcon}).addTo(map);
        // 비행기 아이콘 클릭 시 개별 데이터 블록 토글
        markers[fId].on('click', function() {
            if (openedDataBlocks.has(fId)) {
                openedDataBlocks.delete(fId);
            } else {
                openedDataBlocks.add(fId);
            }
            refreshMapDisplay();
        });
    }

    // 🌟 분리된 Draggable 데이터 블록 구성
    let offset = labelPixelOffsets[fId] || L.point(30, -30);
    let acPoint = map.latLngToLayerPoint([lat, lon]);
    let labelLatLng = map.layerPointToLatLng(acPoint.add(offset));

    const dataBlockIcon = L.divIcon({
        html: labelHtml,
        className: '',
        iconSize: [0, 0], // let inner div dictate size
        iconAnchor: [0, 0] // 라인이 팁창의 좌상단을 향하도록 설정
    });

    if (labelMarkers[fId]) {
        labelMarkers[fId].setLatLng(labelLatLng);
        labelMarkers[fId].setIcon(dataBlockIcon); 
    } else {
        labelMarkers[fId] = L.marker(labelLatLng, {
            icon: dataBlockIcon,
            draggable: true,
            zIndexOffset: 1000 
        }).addTo(map);

        labelMarkers[fId].on('drag', function(e) {
            if (leaderLines[fId] && markers[fId]) {
                leaderLines[fId].setLatLngs([markers[fId].getLatLng(), e.target.getLatLng()]);
            }
        });

        labelMarkers[fId].on('dragend', function(e) {
            if (markers[fId]) {
                let newLatLng = e.target.getLatLng();
                let newAcPt = map.latLngToLayerPoint(markers[fId].getLatLng());
                let lblPt = map.latLngToLayerPoint(newLatLng);
                labelPixelOffsets[fId] = lblPt.subtract(newAcPt);
            }
        });
    }

    // 지시선(Leader line) 구성
    if (leaderLines[fId]) {
        leaderLines[fId].setLatLngs([[lat, lon], labelLatLng]);
    } else {
        leaderLines[fId] = L.polyline([[lat, lon], labelLatLng], {
            color: '#888',
            weight: 1.5,
            opacity: 0.8
        }).addTo(map);
    }

    // 토글 옵션 연동
    if (isDataBlockVisible) {
        if (!map.hasLayer(labelMarkers[fId])) labelMarkers[fId].addTo(map);
        if (!map.hasLayer(leaderLines[fId])) leaderLines[fId].addTo(map);
    } else {
        if (map.hasLayer(labelMarkers[fId])) map.removeLayer(labelMarkers[fId]);
        if (map.hasLayer(leaderLines[fId])) map.removeLayer(leaderLines[fId]);
    }
}
