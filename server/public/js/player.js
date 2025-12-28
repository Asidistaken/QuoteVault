/* --- PLAYER UI CONTROLLER --- */
document.addEventListener('DOMContentLoaded', () => {
    
    // Grab elements INSIDE this function to ensure they exist
    const video = document.getElementById('clip');
    const volumeInput = document.getElementById('volume');
    const playerContainer = document.querySelector('.player-container');
    const videoWrapper = document.querySelector('.video-wrapper');
    const sliderFill = document.querySelector('.slider-fill');
    const sliderThumb = document.querySelector('.slider-thumb');
    const volumePercent = document.querySelector('.volume-percent');
    const restartBtn = document.getElementById('restart-btn');

    // Safety check: if elements are missing, stop (prevents errors on other pages)
    if (!video || !volumeInput) return;

    /* --- PLAY / PAUSE LOGIC --- */
    videoWrapper.addEventListener('click', () => {
        const isSolved = document.querySelector('.answer-input') && document.querySelector('.answer-input').classList.contains('correct');
        
        // Prevent interaction if paused at the "Answer" timestamp
        if (!isSolved && window.stopTimestamp && video.currentTime >= window.stopTimestamp) {
            const input = document.querySelector('.answer-input');
            if(input) {
                input.classList.add('shake');
                setTimeout(() => input.classList.remove('shake'), 500);
                input.focus(); 
            }
            return; 
        }
        
        if (video.paused) {
            video.play();
            videoWrapper.classList.add('playing');
            const hintEl = document.querySelector('.play-hint');
            if(hintEl) hintEl.style.opacity = '0';
        } else {
            video.pause();
            videoWrapper.classList.remove('playing');
            const hintEl = document.querySelector('.play-hint');
            if(hintEl) hintEl.style.opacity = '1';
        }
    });

    /* --- RESTART BUTTON --- */
    if (restartBtn) {
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
    }

    /* --- UI HOVER EFFECTS --- */
    if (playerContainer) {
        playerContainer.addEventListener('mouseenter', () => playerContainer.classList.add('hover-active'));
        playerContainer.addEventListener('mouseleave', () => playerContainer.classList.remove('hover-active'));
    }

    /* --- VOLUME LOGIC --- */
    function updateVolumeUI(value) {
        if(sliderFill) sliderFill.style.height = value + '%';
        if(sliderThumb) sliderThumb.style.bottom = value + '%';
        if(volumePercent) volumePercent.textContent = Math.round(value) + '%';
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
    volumeInput.addEventListener('click', (e) => e.stopPropagation()); 
    volumeInput.addEventListener('mousedown', () => sliderThumb.classList.add('active'));
    volumeInput.addEventListener('mouseup', () => sliderThumb.classList.remove('active'));

    // Initialize Volume
    video.volume = 0.5;
    updateVolumeUI(50);
});