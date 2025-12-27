/* --- PLAYER UI CONTROLLER --- */
const video = document.getElementById('clip');
const volumeInput = document.getElementById('volume');
const playerContainer = document.querySelector('.player-container');
const videoWrapper = document.querySelector('.video-wrapper');
const sliderFill = document.querySelector('.slider-fill');
const sliderThumb = document.querySelector('.slider-thumb');
const volumePercent = document.querySelector('.volume-percent');
const restartBtn = document.getElementById('restart-btn');

/* --- PLAY / PAUSE LOGIC --- */
videoWrapper.addEventListener('click', () => {
    const isSolved = document.querySelector('.answer-input').classList.contains('correct');
    
    // Prevent interaction if paused at the "Answer" timestamp
    if (!isSolved && window.stopTimestamp && video.currentTime >= window.stopTimestamp) {
        const input = document.querySelector('.answer-input');
        if(input) {
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
            input.focus(); 
        }
        return; // EXIT HERE so we don't change the text or play
    }
    
    // Standard Toggle
    if (video.paused) {
        video.play();
        videoWrapper.classList.add('playing');
        
        const hintEl = document.querySelector('.play-hint');
        if(hintEl) hintEl.style.opacity = '0';
    } else {
        video.pause();
        videoWrapper.classList.remove('playing');
        
        // Only show "Click to Play" if we are manually pausing (not at answer time)
        const hintEl = document.querySelector('.play-hint');
        if(hintEl) {
            // Note: We don't change innerHTML here, assuming it's already "Click to Play"
            // or "Answer" depending on state.
            hintEl.style.opacity = '1';
        }
    }
});

/* --- RESTART BUTTON --- */
restartBtn.addEventListener('click', (e) => {
    e.stopPropagation(); 
    video.currentTime = 0;
    
    const hintEl = document.querySelector('.play-hint');
    if(hintEl) {
        hintEl.innerHTML = '<i class="fa-solid fa-play"></i> Click to Play';
        hintEl.style.opacity = '1';
        hintEl.style.display = 'flex';
    }
    
    video.play();
    videoWrapper.classList.add('playing');
});

/* --- UI HOVER EFFECTS --- */
playerContainer.addEventListener('mouseenter', () => playerContainer.classList.add('hover-active'));
playerContainer.addEventListener('mouseleave', () => playerContainer.classList.remove('hover-active'));

/* --- VOLUME LOGIC --- */
function updateVolumeUI(value) {
    sliderFill.style.height = value + '%';
    sliderThumb.style.bottom = value + '%';
    volumePercent.textContent = Math.round(value) + '%';
    volumeInput.value = value;
}

function updateVolume(value) {
    const volumeValue = value / 100;
    video.volume = volumeValue;
    if (video.muted && volumeValue > 0) video.muted = false;
    if (volumeValue === 0) video.muted = true;
    updateVolumeUI(value);
}

volumeInput.addEventListener('input', (e) => updateVolume(e.target.value));
// Stop event propagation so clicking volume doesn't pause video
volumeInput.addEventListener('click', (e) => e.stopPropagation()); 
volumeInput.addEventListener('mousedown', () => sliderThumb.classList.add('active'));
volumeInput.addEventListener('mouseup', () => sliderThumb.classList.remove('active'));

// Initialize Volume
video.volume = 0.5;
updateVolumeUI(50);