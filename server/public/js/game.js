/* --- STATE MANAGEMENT --- */
const POINTS_BASE = 100;
let userScore = 0;
let currentCategory = 'movie'; 
window.currentMode = 'quote'; 
window.stopTimestamp = 0;
let currentContentId = null; 
let startTime = Date.now(); // Track when the question started

// Store current content data
let currentData = {
    quote: { solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    character: { solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    banner: { solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    title: "",
    stopTime: 0
};

const charImg = document.getElementById('char-img');
const bannerImg = document.getElementById('banner-img');
const answerInput = document.querySelector('.answer-input');
const submitBtn = document.querySelector('.submit-btn');

/* --- INITIALIZATION --- */
window.addEventListener('DOMContentLoaded', () => {
    loadCategoryContent('movie');
    
    submitBtn.addEventListener('click', checkAnswer);
    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkAnswer();
    });
});

/* --- CORE FUNCTIONS --- */
window.loadCategoryContent = function(category) {
    currentCategory = category;
    
    // 1. Reset Timer
    startTime = Date.now();

    // 2. Clear Old Content
    document.getElementById('char-img').src = ''; 
    document.getElementById('banner-img').src = '';
    const videoEl = document.getElementById('clip');
    videoEl.src = '';
    
    // Reset Video Player Overlay
    document.querySelector('.video-wrapper').classList.remove('playing');
    
    // Reset Data State
    currentData = {
        quote: { solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
        character: { solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
        banner: { solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
        title: "",
        stopTime: 0
    };
    
    fetch(`/api/content/random?category=${category}`)
        .then(res => {
            if(!res.ok) throw new Error("Network response was not ok");
            return res.json();
        })
        .then(data => {
            if (!data) {
                Swal.fire({ icon: 'info', title: 'Empty', text: `No content found for ${category}!`, background: '#222', color: '#fff' });
                return;
            }

            currentContentId = data.id;
            currentData.title = data.title;
            currentData.stopTime = data.stop_timestamp;
            
            if(data.char_pixel_level) currentData.character.level = data.char_pixel_level;
            if(data.banner_pixel_level) currentData.banner.level = data.banner_pixel_level;

            videoEl.src = data.video_path || ''; 
            window.stopTimestamp = data.stop_timestamp || 0;
            
            charImg.dataset.src = data.image_char_path || '';
            bannerImg.dataset.src = data.image_banner_path || '';

            window.updateInputState();
            renderImages();
        })
        .catch(err => console.error(err));
};

window.updateInputState = function() {
    const state = currentData[window.currentMode];
    answerInput.classList.remove('correct', 'wrong', 'shake');
    answerInput.value = '';
    
    if (state.solved) {
        answerInput.classList.add('correct');
        answerInput.disabled = true;
        answerInput.value = "SOLVED"; 
    } else {
        answerInput.disabled = false;
    }
};

function renderImages() {
    const charState = currentData.character;
    const bannerState = currentData.banner;

    if(charImg.dataset.src) {
        const url = `/api/image-proxy?path=${encodeURIComponent(charImg.dataset.src)}&level=${charState.solved ? 1.0 : charState.level}&t=${Date.now()}`;
        charImg.src = url;
    }
    
    if(bannerImg.dataset.src) {
        const url = `/api/image-proxy?path=${encodeURIComponent(bannerImg.dataset.src)}&level=${bannerState.solved ? 1.0 : bannerState.level}&t=${Date.now()}`;
        bannerImg.src = url;
    }
}

/* --- ANSWER CHECKING --- */
function checkAnswer() {
    const mode = window.currentMode;
    const state = currentData[mode];
    if (state.solved) return;

    const userGuess = answerInput.value;
    if (!userGuess) return;

    // Calculate Time Taken (Seconds)
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    state.attempts++;

    fetch('/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contentId: currentContentId,
            mode: mode,
            userGuess: userGuess,
            attempts: state.attempts, 
            hints: state.hintsUsed,
            timeTaken: timeTaken // Send the time
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.correct) {
            state.solved = true;
            answerInput.value = data.correctString;
            answerInput.classList.add('correct');
            renderImages();
            
            if (mode === 'quote') {
                const v = document.getElementById('clip');
                v.play();
                document.querySelector('.video-wrapper').classList.add('playing');
            }
        } else {
            answerInput.classList.add('shake', 'wrong');
            setTimeout(() => answerInput.classList.remove('shake', 'wrong'), 500);
            window.revealHint(true);
        }
    });
}

/* --- HINT LOGIC --- */
window.revealHint = function(isAuto = false) {
    const state = currentData[window.currentMode];
    if (state.solved) return;
    
    if (!isAuto) state.hintsUsed++;

    if (state.level < 1.0) {
        state.level += 0.1;
        renderImages();
    }
};

const vidEl = document.getElementById('clip');
if (vidEl) {
    vidEl.addEventListener('timeupdate', () => {
        if (!currentData || currentData.quote.solved) return;
        if (!vidEl.paused && vidEl.currentTime >= window.stopTimestamp) {
            vidEl.pause();
            vidEl.currentTime = window.stopTimestamp;
        }
    });
}