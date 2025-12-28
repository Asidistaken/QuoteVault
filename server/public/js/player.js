document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('clip');
    const videoWrapper = document.querySelector('.video-wrapper');
    const restartBtn = document.getElementById('restart-btn');
    
    // Volume Elements
    const volumeInput = document.getElementById('volume');
    const sliderFill = document.querySelector('.slider-fill');
    const sliderThumb = document.querySelector('.slider-thumb');
    const volumePercent = document.querySelector('.volume-percent');

    if (!video || !volumeInput) return;

    /* --- PLAY / PAUSE LOGIC --- */
    videoWrapper.addEventListener('click', () => {
        // Prevent interaction if content is stopped/frozen by game logic
        const isSolved = document.querySelector('.answer-input') && document.querySelector('.answer-input').classList.contains('correct');
        if (!isSolved && window.stopTimestamp && video.currentTime >= window.stopTimestamp) return;

        if (video.paused) {
            video.play();
            videoWrapper.classList.add('playing');
        } else {
            video.pause();
            videoWrapper.classList.remove('playing');
        }
    });

    /* --- RESTART LOGIC --- */
    if (restartBtn) {
        restartBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent toggling play/pause on wrapper
            video.currentTime = 0;
            video.play();
            videoWrapper.classList.add('playing');
        });
    }

    /* --- VOLUME LOGIC --- */
    function updateVolumeUI(val) {
        // Update the visual height of the fill bar
        if(sliderFill) sliderFill.style.height = val + '%';
        
        // Update the position of the thumb
        if(sliderThumb) sliderThumb.style.bottom = val + '%';
        
        // Update Text
        if(volumePercent) volumePercent.textContent = val + '%';
        
        // ICON CHANGE REMOVED HERE
    }

    function setVolume(val) {
        const volumeValue = val / 100;
        video.volume = volumeValue;
        
        // Handle Mute State (Logic only, no visual icon change)
        if (video.muted && volumeValue > 0) video.muted = false;
        if (volumeValue === 0) video.muted = true;
        
        updateVolumeUI(val);
    }

    // Event Listeners for Input
    volumeInput.addEventListener('input', (e) => {
        setVolume(e.target.value);
    });

    // Prevent click on volume from pausing video (bubbling)
    const volContainer = document.querySelector('.volume-container');
    if(volContainer) {
        volContainer.addEventListener('click', (e) => e.stopPropagation());
    }

    // Initialize Volume at 50%
    setVolume(50);
});