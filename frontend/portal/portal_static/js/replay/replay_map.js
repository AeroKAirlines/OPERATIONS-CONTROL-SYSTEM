// replay_map.js
// Handles map rendering, toggles, and time machine logic

let replayMap;
let planLineLayer;
let actualLineLayer;
let fixLayerGroup;
let acarsLayerGroup;
let planeMarker;

let mapFilterState = {
    showFixes: false,
    fixName: true,
    fixEfob: true,
    fixTime: true,
    fixAlt: true,
    showAcars: true, // Default ON in replay
    acarsFob: true,
    acarsTime: true,
    acarsAlt: true,
    acarsSpeed: true,
    acTooltipAlways: true
};

const planeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" transform="rotate(-45)"><path fill="#4ade80" d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;

const planeIcon = L.divIcon({
    html: planeIconSVG,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
});

// Helper function to parse N/S/E/W coordinates from DB
function parseCoordinate(coordStr) {
    if (!coordStr) return null;
    try {
        coordStr = coordStr.toString().replace(/\s+/g, '').toUpperCase();
        if (coordStr.length === 0) return null;
        
        const dir = coordStr.charAt(0);
        
        if (!['N', 'S', 'E', 'W'].includes(dir)) {
            const val = parseFloat(coordStr);
            return isNaN(val) ? null : val;
        }
        
        const isNeg = (dir === 'S' || dir === 'W');
        if (coordStr.indexOf('.') === 3 || coordStr.indexOf('.') === 4) {
            let val = parseFloat(coordStr.substring(1));
            return isNaN(val) ? null : (isNeg ? -val : val);
        }
        let degLen = (dir === 'N' || dir === 'S') ? 2 : 3;
        let degStr = coordStr.substring(1, 1 + degLen);
        if (!degStr) return null;
        
        let deg = parseFloat(degStr);
        if (isNaN(deg)) return null;
        
        let minStr = coordStr.substring(1 + degLen);
        if (!minStr) return isNeg ? -deg : deg;
        
        let min = minStr.includes('.') ? parseFloat(minStr) : parseFloat(minStr) / 10;
        if (isNaN(min)) min = 0;
        
        return isNeg ? -(deg + min / 60) : (deg + min / 60);
    } catch(e) { return null; }
}

function initReplayMap() {
    if (!replayMap) {
        replayMap = L.map('map', {
            center: [36.5, 127.5], // Center of Korea
            zoom: 6,
            zoomControl: false
        });
        
        L.control.zoom({ position: 'bottomright' }).addTo(replayMap);

        // Dark theme map tiles (similar to dashboard)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(replayMap);

        fixLayerGroup = L.layerGroup().addTo(replayMap);
        acarsLayerGroup = L.layerGroup().addTo(replayMap);
        
        setupLayerToggles();
    } else {
        // Clear previous data
        if (planLineLayer) { replayMap.removeLayer(planLineLayer); planLineLayer = null; }
        if (actualLineLayer) { replayMap.removeLayer(actualLineLayer); actualLineLayer = null; }
        if (planeMarker) { replayMap.removeLayer(planeMarker); planeMarker = null; }
        fixLayerGroup.clearLayers();
        acarsLayerGroup.clearLayers();
    }
}

function setupLayerToggles() {
    const attachToggle = (id, key, callback) => {
        const el = document.getElementById(id);
        if (el) {
            // init from state
            el.checked = mapFilterState[key];
            el.addEventListener('change', (e) => {
                mapFilterState[key] = e.target.checked;
                if (callback) callback();
            });
        }
    };

    attachToggle('toggle-fix-master', 'showFixes', renderMapElements);
    attachToggle('toggle-fix-name', 'fixName', renderMapElements);
    attachToggle('toggle-fix-efob', 'fixEfob', renderMapElements);
    attachToggle('toggle-fix-time', 'fixTime', renderMapElements);
    attachToggle('toggle-fix-alt', 'fixAlt', renderMapElements);

    attachToggle('toggle-acars-master', 'showAcars', renderMapElements);
    attachToggle('toggle-acars-fob', 'acarsFob', renderMapElements);
    attachToggle('toggle-acars-time', 'acarsTime', renderMapElements);
    attachToggle('toggle-acars-alt', 'acarsAlt', renderMapElements);
    attachToggle('toggle-acars-speed', 'acarsSpeed', renderMapElements);
    attachToggle('toggle-ac-tooltip', 'acTooltipAlways', renderMapElements);
}

function renderFlightOnMap(flightData) {
    if (!flightData || !replayMap) return;

    // 1. Draw Planned Line (OFP)
    const ofpPoints = flightData.ofp ? flightData.ofp.points : [];
    let planCoords = [];

    if (ofpPoints && ofpPoints.length > 0) {
        planCoords = ofpPoints
            .filter(p => p.lat && (p.lon || p.long))
            .map(p => [parseCoordinate(p.lat), parseCoordinate(p.lon || p.long)])
            .filter(coord => coord[0] !== null && coord[1] !== null && !isNaN(coord[0]) && !isNaN(coord[1])); // remove NaNs
    }

    // Try to get DEP and ARR coords from positions to connect the dots (DCT)
    if (flightData.positions && flightData.positions.length > 0) {
        // positions are sorted in replay_main.js before calling this
        const firstPos = flightData.positions[0];
        const lastPos = flightData.positions[flightData.positions.length - 1];

        let depLat = parseCoordinate(firstPos.lat);
        let depLon = parseCoordinate(firstPos.lon);
        let arrLat = parseCoordinate(lastPos.lat);
        let arrLon = parseCoordinate(lastPos.lon);

        if (planCoords.length > 0) {
            if (depLat !== null && depLon !== null && !isNaN(depLat) && !isNaN(depLon)) {
                const firstPlan = planCoords[0];
                // If the first FIX is far from the airport, prepend the airport to draw DCT line
                if (Math.abs(firstPlan[0] - depLat) > 0.02 || Math.abs(firstPlan[1] - depLon) > 0.02) {
                    planCoords.unshift([depLat, depLon]);
                }
            }
            
            if (arrLat !== null && arrLon !== null && !isNaN(arrLat) && !isNaN(arrLon)) {
                const lastPlan = planCoords[planCoords.length - 1];
                // If the last FIX is far from the airport, append the airport to draw DCT line
                if (Math.abs(lastPlan[0] - arrLat) > 0.02 || Math.abs(lastPlan[1] - arrLon) > 0.02) {
                    planCoords.push([arrLat, arrLon]);
                }
            }
        } else if (depLat !== null && arrLat !== null && !isNaN(depLat) && !isNaN(arrLat)) {
             // No OFP data, but we have DEP and ARR, just draw a direct line between them
             planCoords.push([depLat, depLon]);
             planCoords.push([arrLat, arrLon]);
        }
    }

    if (planCoords.length > 1) {
        planLineLayer = L.polyline(planCoords, {
            color: '#8b9bb4', // Grayish blue
            weight: 2,
            opacity: 0.6,
            dashArray: '5, 10' // Dashed line for plan
        }).addTo(replayMap);
        
        // Fit bounds to plan
        replayMap.fitBounds(planLineLayer.getBounds(), { padding: [50, 50] });
    }

    // 2. Initial Draw (will be updated by timeline immediately anyway)
    renderMapElements();
}

function renderMapElements() {
    if (!currentReplayFlight || !replayMap) return;

    fixLayerGroup.clearLayers();
    acarsLayerGroup.clearLayers();

    // 1. Render FIXes
    if (mapFilterState.showFixes && currentReplayFlight.ofp && currentReplayFlight.ofp.points) {
        currentReplayFlight.ofp.points.forEach(pt => {
            let lonVal = pt.lon || pt.long;
            if (!pt.lat || !lonVal) return;
            let pLat = parseCoordinate(pt.lat);
            let pLon = parseCoordinate(lonVal);
            if (pLat === null || pLon === null || isNaN(pLat) || isNaN(pLon)) return;
            
            const latlng = [pLat, pLon];
            
            let labels = [];
            if (mapFilterState.fixName) labels.push(`<div style="color: #4ade80; font-weight: 800; font-size: 11px;">${pt.wpt || 'N/A'}</div>`);
            if (mapFilterState.fixEfob) {
                let efobVal = parseFloat(pt.efob || 0);
                if (isNaN(efobVal)) efobVal = 0;
                labels.push(`<div style="color: #fca311; font-size: 10px; font-weight: 600;">EFOB:${efobVal.toFixed(1)}</div>`);
            }
            if (mapFilterState.fixTime && pt.tot_t) labels.push(`<div style="color: #60a5fa; font-size: 10px; font-weight: 600;">T:${pt.tot_t}</div>`);
            if (mapFilterState.fixAlt && pt.fl) labels.push(`<div style="color: #f472b6; font-size: 10px; font-weight: 600;">${pt.fl}</div>`);
            
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
            
            L.marker(latlng, { icon: dotIcon }).addTo(fixLayerGroup);
        });
    }

    // ACARS rendering is handled dynamically by handleTimelineChange 
    // to achieve the "Time Machine" effect.
    window.isAcarsMarkersBuilt = false; // Force rebuild on filter change
    if (typeof currentTargetTs !== 'undefined' && currentTargetTs > 0) {
        handleTimelineChange(currentTargetTs);
    }
}

// --- The Time Machine Logic ---
function handleTimelineChange(targetTs) {
    try {
        if (!currentPositions || currentPositions.length === 0 || !replayMap) return;

        // 방어: targetTs가 잘못 넘어왔을 경우 범위 제한
        const startTs = currentPositions[0].timestamp;
        const endTs = currentPositions[currentPositions.length - 1].timestamp;
        if (isNaN(targetTs) || targetTs < startTs) targetTs = startTs;
        if (targetTs > endTs) targetTs = endTs;

        // 1. Slice positions up to the current timeline index
        // This creates the Time Machine effect (future markers disappear)
        const historyPositions = currentPositions.filter(p => p.timestamp <= targetTs);
        
        // 2. Draw Actual Track Line (Solid) up to current time
        const actualCoords = historyPositions
            .map(p => [parseCoordinate(p.lat), parseCoordinate(p.lon)])
            .filter(coord => coord[0] !== null && coord[1] !== null && !isNaN(coord[0]) && !isNaN(coord[1]));
        
        if (actualCoords.length > 0) {
            if (!actualLineLayer) {
                actualLineLayer = L.polyline(actualCoords, {
                    color: '#fca311', // Orange for actual track
                    weight: 3,
                    opacity: 0.9
                }).addTo(replayMap);
            } else {
                actualLineLayer.setLatLngs(actualCoords);
                if (!replayMap.hasLayer(actualLineLayer)) {
                    actualLineLayer.addTo(replayMap);
                }
            }
        } else if (actualLineLayer && replayMap.hasLayer(actualLineLayer)) {
            replayMap.removeLayer(actualLineLayer);
        }

        // 3. Draw ACARS History Markers (Points)
        if (!window.isAcarsMarkersBuilt) {
            acarsLayerGroup.clearLayers();
            window.acarsMarkersArray = [];
            
            let offPoint = currentPositions.find(x => x.type === 'OFF');
            
            currentPositions.forEach((p) => {
                const pLat = parseCoordinate(p.lat);
                const pLon = parseCoordinate(p.lon);
                if (pLat === null || pLon === null || isNaN(pLat) || isNaN(pLon)) return;

                const latlng = [pLat, pLon];
                
                let dotMarkup = '';
                let labelHtml = '';
                
                if (p.type === 'POS') {
                    dotMarkup = `<div style="width: 6px; height: 6px; background-color: #60a5fa; border-radius: 50%; box-shadow: 0 0 2px rgba(0,0,0,0.8); margin-left: -3px; margin-top: -3px; flex-shrink: 0;"></div>`;
                    
                    let labels = [];
                    if (mapFilterState.acarsFob && p.fob != null && p.fob !== '') labels.push(`<div style="color: #fca311; font-size: 10px; font-weight: 600;">${p.fob}</div>`);
                    if (mapFilterState.acarsTime && p.time != null && p.time !== '') {
                        let actualTimeZ = `${formatTimeStr(p.time)}z`;
                        if (offPoint && p.timestamp >= offPoint.timestamp) {
                            let diffMs = p.timestamp - offPoint.timestamp;
                            let totalMins = Math.floor(diffMs / 60000);
                            let hh = String(Math.floor(totalMins / 60)).padStart(2, '0');
                            let mm = String(totalMins % 60).padStart(2, '0');
                            labels.push(`<div style="color: #60a5fa; font-size: 10px; font-weight: 600;">T:${hh}:${mm} / ${actualTimeZ}</div>`);
                        } else {
                            labels.push(`<div style="color: #60a5fa; font-size: 10px; font-weight: 600;">${actualTimeZ}</div>`);
                        }
                    }
                    if (mapFilterState.acarsAlt && p.alt != null && p.alt !== '') {
                    let cleanAlt = p.alt.toString().replace(/^[+-]/, '');
                    labels.push(`<div style="color: #f472b6; font-size: 10px; font-weight: 600;">${cleanAlt}</div>`);
                }
                    if (mapFilterState.acarsSpeed && p.speed != null && p.speed !== '') {
                        let spdDisp = p.speed.toString();
                        if (!spdDisp.toUpperCase().startsWith('M') && parseFloat(spdDisp) >= 100) spdDisp = `M.${spdDisp}`;
                        labels.push(`<div style="color: #a78bfa; font-size: 10px; font-weight: 600;">${spdDisp}</div>`);
                    }
                    
                    if (labels.length > 0) {
                        labelHtml = `<div style="font-family: 'Inter', sans-serif; line-height: 1.1; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0px 2px 2px rgba(0,0,0,0.8); padding-left: 6px;">
                            ${labels.join('')}
                        </div>`;
                    }
                } else {
                    dotMarkup = `<div style="width: 6px; height: 6px; background-color: #fff; border: 2px solid #fca311; border-radius: 50%; box-shadow: 0 0 2px rgba(0,0,0,0.8); margin-left: -4px; margin-top: -4px;"></div>`;
                }
                
                const dotIcon = L.divIcon({
                    html: `<div style="position: absolute; display: flex; flex-direction: column; align-items: flex-start; overflow: visible;">
                             <div>${dotMarkup}</div>
                             <div style="white-space: nowrap; pointer-events: none; margin-top: 2px;">${labelHtml}</div>
                           </div>`,
                    className: '',
                    iconSize: [0, 0],
                    iconAnchor: [0, 0]
                });
                
                const marker = L.marker(latlng, { icon: dotIcon });
                marker.timestamp = p.timestamp;
                window.acarsMarkersArray.push(marker);
            });
            window.isAcarsMarkersBuilt = true;
        }

        if (mapFilterState.showAcars) {
            window.acarsMarkersArray.forEach(m => {
                if (m.timestamp <= targetTs) {
                    if (!acarsLayerGroup.hasLayer(m)) acarsLayerGroup.addLayer(m);
                } else {
                    if (acarsLayerGroup.hasLayer(m)) acarsLayerGroup.removeLayer(m);
                }
            });
        } else {
            acarsLayerGroup.clearLayers();
        }

        // 4. Update Plane Marker (Interpolation or Exact)
        updatePlaneMarker(targetTs, historyPositions);
    } catch (e) {
        console.error("Timeline update error:", e);
    }
}

function updatePlaneMarker(targetTs, historyPositions) {
    try {
        if (!currentPositions || currentPositions.length === 0) return;
        
        let prevPos = currentPositions[0];
        let nextPos = currentPositions[currentPositions.length - 1];
        let isLast = false;
        
        if (targetTs <= prevPos.timestamp) {
            nextPos = prevPos;
        } else if (targetTs >= nextPos.timestamp) {
            prevPos = nextPos;
            isLast = true;
        } else {
            for (let i = 0; i < currentPositions.length - 1; i++) {
                if (currentPositions[i].timestamp <= targetTs && targetTs <= currentPositions[i+1].timestamp) {
                    prevPos = currentPositions[i];
                    nextPos = currentPositions[i+1];
                    if (prevPos.timestamp === nextPos.timestamp) {
                        nextPos = prevPos;
                    }
                    break;
                }
            }
        }

        let pLat, pLon, displayData;

        let pAltClean = prevPos.alt != null ? prevPos.alt.toString().replace(/^[+-]/, '') : '';
        let nAltClean = nextPos.alt != null ? nextPos.alt.toString().replace(/^[+-]/, '') : '';

        if (!window.isInterpolationEnabled || prevPos === nextPos) {
            // Snap to exact last report
            pLat = parseCoordinate(prevPos.lat);
            pLon = parseCoordinate(prevPos.lon);
            displayData = {
                time: formatTimeStr(prevPos.time),
                alt: pAltClean,
                speed: prevPos.speed,
                fob: prevPos.fob,
                type: prevPos.type
            };
        } else {
            // Interpolate between prevPos and nextPos
            let prevLat = parseCoordinate(prevPos.lat);
            let prevLon = parseCoordinate(prevPos.lon);
            let nextLat = parseCoordinate(nextPos.lat);
            let nextLon = parseCoordinate(nextPos.lon);
            
            if (prevLat === null || prevLon === null || isNaN(prevLat) || isNaN(prevLon)) {
                prevLat = nextLat; prevLon = nextLon;
            }
            if (nextLat === null || nextLon === null || isNaN(nextLat) || isNaN(nextLon)) {
                nextLat = prevLat; nextLon = prevLon;
            }

            const ratio = (targetTs - prevPos.timestamp) / (nextPos.timestamp - prevPos.timestamp);
            
            pLat = prevLat + (nextLat - prevLat) * ratio;
            pLon = prevLon + (nextLon - prevLon) * ratio;
            
            // Helper to interpolate numbers hiding in strings (e.g. "+35000", "FL350", "8200", "M.78")
            const interpolateNumStr = (v1, v2, r) => {
                if (!v1 && !v2) return '---';
                if (!v1) return v2;
                if (!v2) return v1;
                
                let n1 = parseFloat(v1.toString().replace(/[^\d.-]/g, ''));
                let n2 = parseFloat(v2.toString().replace(/[^\d.-]/g, ''));
                if (isNaN(n1) || isNaN(n2)) return v1;
                
                let val = n1 + (n2 - n1) * r;
                
                let str1 = v1.toString();
                let prefix = str1.match(/^([^\d.-]+)/);
                let suffix = str1.match(/([^\d.-]+)$/);
                
                let decimals = 0;
                if (str1.includes('.')) {
                    decimals = str1.split('.')[1].replace(/[^\d]/g, '').length;
                }
                
                let outStr = val.toFixed(decimals);
                
                return (prefix ? prefix[1] : '') + outStr + (suffix ? suffix[1] : '');
            };
            
            // String-based Time Interpolation (Ignores absolute timezone epoch issues)
            const parseTimeStr = (tStr) => {
                if (!tStr) return 0;
                let s = tStr.toString().split('/')[0].replace(/\D/g, '');
                if (s.length >= 4) {
                    s = s.substring(s.length - 4);
                    return parseInt(s.substring(0,2), 10) * 60 + parseInt(s.substring(2,4), 10);
                }
                return 0;
            };
            let prevMins = parseTimeStr(prevPos.time);
            let nextMins = parseTimeStr(nextPos.time);
            if (nextMins < prevMins) nextMins += 24 * 60; // handle midnight rollover
            let interpMins = Math.round(prevMins + (nextMins - prevMins) * ratio);
            let currentHh = String(Math.floor(interpMins / 60) % 24).padStart(2, '0');
            let currentMm = String(interpMins % 60).padStart(2, '0');
            
            displayData = {
                time: `${currentHh}${currentMm}`,
                alt: interpolateNumStr(pAltClean, nAltClean, ratio),
                speed: interpolateNumStr(prevPos.speed, nextPos.speed, ratio),
                fob: interpolateNumStr(prevPos.fob, nextPos.fob, ratio),
                type: prevPos.type // Inherit phase from prev
            };
        }
        
        if (pLat === null || pLon === null || isNaN(pLat) || isNaN(pLon)) return;
        
        let targetLatLng = [pLat, pLon];

        let fNum = currentReplayFlight.master.flight_number || "FLIGHT";
        
        // Calculate angle accurately based on trajectory
        let angle = 45; // default
        if (prevPos !== nextPos) {
            const pLat1 = parseCoordinate(prevPos.lat);
            const pLon1 = parseCoordinate(prevPos.lon);
            const pLat2 = parseCoordinate(nextPos.lat);
            const pLon2 = parseCoordinate(nextPos.lon);
            if (pLat1 !== null && pLon1 !== null && pLat2 !== null && pLon2 !== null) {
                const dy = pLat2 - pLat1;
                const dx = pLon2 - pLon1;
                angle = Math.atan2(dx, dy) * (180 / Math.PI);
            }
        } else if (historyPositions && historyPositions.length > 1) {
            // If at the end or no next point, use previous heading
            const p1 = historyPositions[historyPositions.length - 2];
            const p2 = historyPositions[historyPositions.length - 1];
            const pLat1 = parseCoordinate(p1.lat);
            const pLon1 = parseCoordinate(p1.lon);
            const pLat2 = parseCoordinate(p2.lat);
            const pLon2 = parseCoordinate(p2.lon);
            if (pLat1 !== null && pLon1 !== null && pLat2 !== null && pLon2 !== null) {
                const dy = pLat2 - pLat1;
                const dx = pLon2 - pLon1;
                angle = Math.atan2(dx, dy) * (180 / Math.PI);
            }
        }

        const isDataBlockVisible = mapFilterState.acTooltipAlways;
        const inlineLabelDisplay = isDataBlockVisible ? 'none' : 'block';
        
        const planeIconHtml = `<div style="position: relative; width: 24px; height: 24px; cursor: pointer;">
            <div class="plane-icon" style="transform: rotate(${angle}deg); background-image: url('data:image/svg+xml;utf8,<svg fill=%22%23fca311%22 viewBox=%220 0 24 24%22 xmlns=%22http://www.w3.org/2000/svg%22><path d=%22M21,16V14L13,9V3.5A1.5,1.5 0 0,0 11.5,2A1.5,1.5 0 0,0 10,3.5V9L2,14V16L10,13.5V19L8,20.5V22L11.5,21L15,22V20.5L13,19V13.5L21,16Z%22/></svg>'); width: 24px; height: 24px; background-size: contain; background-repeat: no-repeat; filter: drop-shadow(0px 0px 3px rgba(0,0,0,0.8));"></div>
            <div class="flight-label" style="display: ${inlineLabelDisplay}; position: absolute; top: 12px; left: 24px; color: #fff; font-family: monospace; font-size: 12px; font-weight: bold; text-shadow: 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000; white-space: nowrap; pointer-events: none;">${fNum}</div>
        </div>`;

        const dynamicPlaneIcon = L.divIcon({ className: '', html: planeIconHtml, iconSize: [24, 24], iconAnchor:[12, 12] });

        if (!planeMarker) {
            planeMarker = L.marker(targetLatLng, { icon: dynamicPlaneIcon }).addTo(replayMap);
        } else {
            planeMarker.setLatLng(targetLatLng);
            planeMarker.setIcon(dynamicPlaneIcon);
            if (!replayMap.hasLayer(planeMarker)) {
                planeMarker.addTo(replayMap);
            }
        }

        let mchStr = displayData.speed != null ? displayData.speed.toString() : '';
        if (mchStr && !mchStr.toUpperCase().startsWith('M') && parseFloat(mchStr) >= 100) mchStr = `M.${mchStr}`;
        
        const phase = displayData.type && displayData.type !== 'POS' ? displayData.type : 'ACTUAL';
        
        let fobDisp = (displayData.fob != null && displayData.fob !== '') ? displayData.fob : '---';
        let altDisp = (displayData.alt != null && displayData.alt !== '') ? displayData.alt : '---';

        // Plane Data Block
        let blockHtml = `
            <div class="radar-data-block">
                <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 3px; margin-bottom: 4px;">
                    <span style="font-weight: bold; color: #fff; font-size: 12px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; letter-spacing: 0.5px;">${fNum}</span>
                    <span style="color: #888; font-size: 9px; margin-left: 12px;">${phase}</span>
                </div>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 2px 14px; font-size: 10px;">
                    <span style="color: #888; font-weight: bold;">REG</span>
                    <span style="color: #ddd; font-weight: bold; text-align: right;">${currentReplayFlight.master.reg || 'N/A'}</span>
                    
                    <span style="color: #888; font-weight: bold;">FOB</span>
                    <span style="color: #fca311; font-weight: bold; text-align: right;">${fobDisp}</span>
                    
                    <span style="color: #888; font-weight: bold;">TIME</span>
                    <span style="color: #ddd; font-weight: bold; text-align: right;">${displayData.time}Z</span>
                    
                    <span style="color: #888; font-weight: bold;">ALT</span>
                    <span style="color: #ddd; font-weight: bold; text-align: right;">${altDisp}</span>
                    
                    <span style="color: #888; font-weight: bold;">SPD</span>
                    <span style="color: #ddd; font-weight: bold; text-align: right;">${mchStr || '---'}</span>
                </div>
            </div>
        `;

        const currentTooltip = planeMarker.getTooltip();
        if (!currentTooltip) {
            planeMarker.bindTooltip(blockHtml, {
                permanent: mapFilterState.acTooltipAlways,
                direction: 'right',
                className: 'transparent-tooltip',
                offset: [12, 0]
            });
        } else {
            if (currentTooltip.options.permanent !== mapFilterState.acTooltipAlways) {
                planeMarker.unbindTooltip();
                planeMarker.bindTooltip(blockHtml, {
                    permanent: mapFilterState.acTooltipAlways,
                    direction: 'right',
                    className: 'transparent-tooltip',
                    offset: [12, 0]
                });
            } else {
                planeMarker.setTooltipContent(blockHtml);
            }
        }
    } catch (e) {
        console.error("Marker update error:", e);
    }
}