// replay_main.js
// Handles search, timeline UI, and playing logic
let currentReplayFlight = null;
let currentPositions = [];
let playbackInterval = null;
let currentSliderValue = 100;
let currentDayFlights = [];
window.isInterpolationEnabled = false;
let currentTargetTs = 0;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup UI Events
    const inputDate = document.getElementById('search-date');
    const inputFlight = document.getElementById('search-flight');
    const searchResults = document.getElementById('search-results');
    
    // Set default date to today
    inputDate.value = new Date().toISOString().split('T')[0];

    async function loadDailyFlights() {
        const date = inputDate.value;
        if (!date) return;
        
        searchResults.innerHTML = "<div style='color:#ccc; font-size:12px; padding:10px;'>Loading flights...</div>";
        
        try {
            const res = await fetch(`/api/replay/search?date=${date}`);
            currentDayFlights = await res.json();
            renderFlightList();
        } catch (e) {
            console.error("Search Error", e);
            searchResults.innerHTML = "<div style='color:#f87171; font-size:12px; padding:10px;'>Failed to load flights.</div>";
        }
    }

    function renderFlightList() {
        searchResults.innerHTML = "";
        const filterText = inputFlight.value.trim().toUpperCase();
        
        const filtered = currentDayFlights.filter(f => 
            f.flight_number && f.flight_number.toUpperCase().includes(filterText)
        );

        if (filtered.length === 0) {
            searchResults.innerHTML = "<div style='color:#ccc; font-size:12px; padding:10px;'>No flights found.</div>";
            return;
        }

        filtered.forEach(f => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="result-header">
                    <strong class="result-flight-no">${f.flight_number}</strong>
                    <span class="result-status">${f.status || 'SCHED'}</span>
                </div>
                <div class="result-details">${f.dep || '-'} &rarr; ${f.arr || '-'} <span class="result-std">| STD: ${f.std || '-'}</span></div>
            `;
            item.addEventListener('click', () => loadFlightData(f.id, item));
            searchResults.appendChild(item);
        });
    }

    inputDate.addEventListener('change', loadDailyFlights);
    inputFlight.addEventListener('input', renderFlightList);

    // Initial load
    loadDailyFlights();

    // Layer Toggle Setup (Map Controls)
    const btnLayerToggle = document.getElementById('btn-layer-toggle');
    const mapControls = document.getElementById('map-controls');
    btnLayerToggle.addEventListener('click', () => {
        const isHidden = mapControls.style.display === 'none' || mapControls.style.display === '';
        mapControls.style.display = isHidden ? 'flex' : 'none';
        
        if (isHidden) {
            btnLayerToggle.classList.add('active');
        } else {
            btnLayerToggle.classList.remove('active');
        }
    });

    setupTimelineEvents();
});

async function loadFlightData(flightId, el) {
    // UI Highlighting
    document.querySelectorAll('.search-result-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');

    try {
        const res = await fetch(`/api/replay/flight/${flightId}`);
        if (!res.ok) throw new Error("Failed to load flight data");
        const data = await res.json();
        
        currentReplayFlight = data;
        let posArr = data.positions || [];
        
        posArr.sort((a,b) => a.timestamp - b.timestamp);
        currentPositions = posArr;
        
        // Ensure map is initialized and data drawn
        if (typeof initReplayMap === 'function') {
            initReplayMap();
            renderFlightOnMap(data);
        }
        
        // Update Info Panel
        document.getElementById('flight-info-panel').style.display = 'block';
        const formatTimeWithZ = (t) => t ? t + (t.toString().toUpperCase().endsWith('Z') ? '' : 'Z') : '--:--';

        document.getElementById('info-flight-num').innerText = data.master.flight_number || '---';
        document.getElementById('info-dep').innerText = data.master.dep || '---';
        document.getElementById('info-arr').innerText = data.master.arr || '---';
        document.getElementById('info-std').innerText = formatTimeWithZ(data.master.std);
        document.getElementById('info-sta').innerText = formatTimeWithZ(data.master.sta);
        document.getElementById('info-atd').innerText = formatTimeWithZ(data.master.out_time);
        document.getElementById('info-ata').innerText = formatTimeWithZ(data.master.in_time);
        document.getElementById('info-reg').innerText = data.master.reg || '---';

        // 🌟 Populate OOOI FOB data in Info Panel
        if (data.oooi) {
            document.getElementById('info-out-fob').innerText = data.oooi.out_fob || '---';
            document.getElementById('info-off-fob').innerText = data.oooi.off_fob || '---';
            document.getElementById('info-on-fob').innerText  = data.oooi.on_fob  || '---';
            document.getElementById('info-in-fob').innerText  = data.oooi.in_fob  || '---';
        } else {
            document.getElementById('info-out-fob').innerText = '---';
            document.getElementById('info-off-fob').innerText = '---';
            document.getElementById('info-on-fob').innerText  = '---';
            document.getElementById('info-in-fob').innerText  = '---';
        }

        // Setup Timeline
        setupTimelineData();

    } catch (e) {
        console.error("Load Flight Error", e);
        document.getElementById('search-results').innerHTML = `<div style="color:red; padding:10px;">Error: ${e.message}<br/>${e.stack}</div>`;
        alert("Failed to load flight details.");
    }
}

function setupTimelineData() {
    const slider = document.getElementById('timeline-slider');
    const btnPlay = document.getElementById('btn-play-pause');
    const selectSpeed = document.getElementById('playback-speed');
    const timeStart = document.getElementById('time-start');
    const timeEnd = document.getElementById('time-end');
    const timeCurrent = document.getElementById('time-current');

    if (currentPositions.length === 0) {
        slider.disabled = true;
        btnPlay.disabled = true;
        selectSpeed.disabled = true;
        timeCurrent.innerText = "NO DATA";
        return;
    }

    slider.disabled = false;
    btnPlay.disabled = false;
    selectSpeed.disabled = false;

    window.isInterpolationEnabled = document.getElementById('toggle-interpolation')?.checked || false;

    const firstPos = currentPositions[0];
    const lastPos = currentPositions[currentPositions.length - 1];
    
    const minTimestamp = firstPos.timestamp;
    const maxTimestamp = lastPos.timestamp;
    
    if (window.isInterpolationEnabled) {
        const totalMinutes = Math.floor((maxTimestamp - minTimestamp) / 60000) || 1;
        slider.min = 0;
        slider.max = totalMinutes;
        slider.value = totalMinutes;
        currentSliderValue = totalMinutes;
        currentTargetTs = maxTimestamp;
    } else {
        slider.min = 0;
        slider.max = currentPositions.length - 1;
        slider.value = currentPositions.length - 1;
        currentSliderValue = currentPositions.length - 1;
        currentTargetTs = maxTimestamp;
    }
    
    timeStart.innerText = `OUT: ${formatTimeStr(firstPos.time)}Z`;
    timeEnd.innerText = `IN: ${formatTimeStr(lastPos.time)}Z`;
    
    updateTimelineUI(currentTargetTs);
    
    if (typeof handleTimelineChange === 'function') {
        handleTimelineChange(currentTargetTs);
    }
}

function updateTimelineUI(targetTs) {
    if (!targetTs || !currentPositions || currentPositions.length === 0) return;
    
    let prevPos = currentPositions[0];
    let nextPos = currentPositions[currentPositions.length - 1];
    
    if (targetTs <= prevPos.timestamp) {
        nextPos = prevPos;
    } else if (targetTs >= nextPos.timestamp) {
        prevPos = nextPos;
    } else {
        for (let i = 0; i < currentPositions.length - 1; i++) {
            if (currentPositions[i].timestamp <= targetTs && targetTs <= currentPositions[i+1].timestamp) {
                prevPos = currentPositions[i];
                nextPos = currentPositions[i+1];
                if (prevPos.timestamp === nextPos.timestamp) nextPos = prevPos;
                break;
            }
        }
    }
    
    if (prevPos === nextPos) {
        document.getElementById('time-current').innerText = `${formatTimeStr(prevPos.time)}Z`;
        return;
    }
    
    const ratio = (targetTs - prevPos.timestamp) / (nextPos.timestamp - prevPos.timestamp);
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
    if (nextMins < prevMins) nextMins += 24 * 60;
    
    let interpMins = Math.round(prevMins + (nextMins - prevMins) * ratio);
    let hh = String(Math.floor(interpMins / 60) % 24).padStart(2, '0');
    let mm = String(interpMins % 60).padStart(2, '0');
    
    document.getElementById('time-current').innerText = `${hh}:${mm}Z`;
}

function setupTimelineEvents() {
    const slider = document.getElementById('timeline-slider');
    const btnPlay = document.getElementById('btn-play-pause');
    const toggleInterpolation = document.getElementById('toggle-interpolation');
    
    if (toggleInterpolation) {
        toggleInterpolation.addEventListener('change', (e) => {
            window.isInterpolationEnabled = e.target.checked;
            if (currentPositions.length === 0) return;
            
            const startTs = currentPositions[0].timestamp;
            const maxMins = Math.floor((currentPositions[currentPositions.length - 1].timestamp - startTs) / 60000) || 1;

            if (window.isInterpolationEnabled) {
                // Switch to Minute-based
                slider.max = maxMins;
                let currentMins = Math.floor((currentTargetTs - startTs) / 60000);
                if (currentMins < 0) currentMins = 0;
                if (currentMins > maxMins) currentMins = maxMins;
                slider.value = currentMins;
                currentSliderValue = currentMins;
            } else {
                // Switch to Index-based
                slider.max = currentPositions.length - 1;
                // find nearest index
                let nearestIdx = 0;
                let minDiff = Infinity;
                currentPositions.forEach((p, idx) => {
                    let diff = Math.abs(p.timestamp - currentTargetTs);
                    if (diff < minDiff) { minDiff = diff; nearestIdx = idx; }
                });
                slider.value = nearestIdx;
                currentSliderValue = nearestIdx;
                currentTargetTs = currentPositions[nearestIdx].timestamp;
                updateTimelineUI(currentTargetTs);
                if (typeof handleTimelineChange === 'function') handleTimelineChange(currentTargetTs);
            }
        });
    }
    
    slider.addEventListener('input', (e) => {
        if (playbackInterval) {
            clearInterval(playbackInterval);
            playbackInterval = null;
            btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        }
        currentSliderValue = parseInt(e.target.value);
        const startTs = currentPositions[0]?.timestamp || 0;
        
        if (window.isInterpolationEnabled) {
            currentTargetTs = startTs + currentSliderValue * 60000;
        } else {
            currentTargetTs = currentPositions[currentSliderValue].timestamp;
        }
        
        updateTimelineUI(currentTargetTs);
        if (typeof handleTimelineChange === 'function') {
            handleTimelineChange(currentTargetTs);
        }
    });

    btnPlay.addEventListener('click', () => {
        if (playbackInterval) {
            clearInterval(playbackInterval);
            playbackInterval = null;
            btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        } else {
            const startTs = currentPositions[0]?.timestamp || 0;
            const maxVal = parseInt(slider.max);
            
            if (currentSliderValue >= maxVal) {
                currentSliderValue = 0;
                slider.value = 0;
            }
            btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
            
            const speed = parseInt(document.getElementById('playback-speed').value);
            const intervalTime = Math.max(50, 1000 / speed);
            
            playbackInterval = setInterval(() => {
                currentSliderValue++;
                if (currentSliderValue > maxVal) {
                    clearInterval(playbackInterval);
                    playbackInterval = null;
                    btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                    currentSliderValue = maxVal;
                }
                
                slider.value = currentSliderValue;
                if (window.isInterpolationEnabled) {
                    currentTargetTs = startTs + currentSliderValue * 60000;
                } else {
                    currentTargetTs = currentPositions[currentSliderValue].timestamp;
                }
                
                updateTimelineUI(currentTargetTs);
                if (typeof handleTimelineChange === 'function') {
                    handleTimelineChange(currentTargetTs);
                }
            }, intervalTime);
        }
    });
}

function formatTimeStr(rawTime) {
    if (!rawTime) return "--:--";
    rawTime = rawTime.toString();
    let s = rawTime.split('/')[0].replace(/\D/g, '');
    if (s.length >= 4) {
        s = s.substring(s.length - 4);
        return `${s.substring(0,2)}:${s.substring(2,4)}`;
    }
    return rawTime;
}
