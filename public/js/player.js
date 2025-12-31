document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('clip');
    const videoWrapper = document.querySelector('.video-wrapper');
    const restartBtn = document.getElementById('restart-btn');
    
    const volumeInput = document.getElementById('volume');
    const sliderFill = document.querySelector('.slider-fill');
    const sliderThumb = document.querySelector('.slider-thumb');
    const volumePercent = document.querySelector('.volume-percent');

    if (!video || !volumeInput) return;

    videoWrapper.addEventListener('click', () => {
        const isSolved = document.querySelector('.answer-input') && document.querySelector('.answer-input').classList.contains('correct');
        if (!isSolved && window.stopTimestamp && video.currentTime >= window.stopTimestamp) return;

        if (video.paused) {
            video.play();
            videoWrapper.classList.add('playing');
        } else {
            video.pause();
            videoWrapper.classList.remove('playing');
            
            const hint = document.querySelector('.play-hint');
            if (hint) hint.innerHTML = '<i class="fa-solid fa-play"></i> Click to Play';
        }
    });

    if (restartBtn) {
        restartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            video.currentTime = 0;
            const hint = document.querySelector('.play-hint');
            if (hint) hint.innerHTML = '<i class="fa-solid fa-play"></i> Click to Play';
            video.play();
            videoWrapper.classList.add('playing');
        });
    }

    function updateVolumeUI(val) {
        if(sliderFill) sliderFill.style.height = val + '%';
        if(sliderThumb) sliderThumb.style.bottom = val + '%';
        if(volumePercent) volumePercent.textContent = val + '%';
    }

    function setVolume(val) {
        const volumeValue = val / 100;
        video.volume = volumeValue;
        if (video.muted && volumeValue > 0) video.muted = false;
        if (volumeValue === 0) video.muted = true;
        updateVolumeUI(val);
    }

    // Event Listeners for Input
    volumeInput.addEventListener('input', (e) => {
        setVolume(e.target.value);
    });

    const volContainer = document.querySelector('.volume-container');
    if(volContainer) {
        volContainer.addEventListener('click', (e) => e.stopPropagation());
    }

    setVolume(50);
});