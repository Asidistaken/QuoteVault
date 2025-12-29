/* --- STATE MANAGEMENT --- */
const POINTS_BASE = 100;
let userScore = 0;
let currentCategory = 'movie'; 
window.currentMode = 'quote'; 
window.stopTimestamp = 0;
let currentContentId = null; 
let startTime = Date.now(); 

// FIX: Added 'id' field to store specific Question IDs
let currentData = {
    quote: { id: null, solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    character: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    banner: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    title: "",
    stopTime: 0
};

let charImg, bannerImg, answerInput, submitBtn;

/* --- INITIALIZATION --- */
window.addEventListener('DOMContentLoaded', () => {
    charImg = document.getElementById('char-img');
    bannerImg = document.getElementById('banner-img');
    answerInput = document.querySelector('.answer-input');
    submitBtn = document.querySelector('.submit-btn');

    if (!charImg || !bannerImg || !answerInput || !submitBtn) {
        return; 
    }

    loadCategoryContent('movie');
    
    submitBtn.addEventListener('click', checkAnswer);
    answerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') checkAnswer();
    });

    const vidEl = document.getElementById('clip');
    if (vidEl) {
        vidEl.addEventListener('timeupdate', () => {
            if (!currentData || currentData.quote.solved) return;
            
            // LOGIC: Pause at timestamp
            if (!vidEl.paused && vidEl.currentTime >= window.stopTimestamp) {
                vidEl.pause();
                vidEl.currentTime = window.stopTimestamp;

                // UI UPDATE: Show "Answer!" hint
                const wrapper = document.querySelector('.video-wrapper');
                const hint = document.querySelector('.play-hint');
                
                if (wrapper) wrapper.classList.remove('playing'); // Show overlay
                if (hint) hint.innerHTML = '<i class="fa-solid fa-pen"></i> Answer!';
            }
        });
    }
});

/* --- CORE FUNCTIONS --- */
window.loadCategoryContent = function(category) {
    currentCategory = category;
    startTime = Date.now();

    if(charImg) charImg.src = ''; 
    if(bannerImg) bannerImg.src = '';
    
    const videoEl = document.getElementById('clip');
    if(videoEl) videoEl.src = '';
    
    // Reset Player UI
    const videoWrapper = document.querySelector('.video-wrapper');
    const hint = document.querySelector('.play-hint');
    if(videoWrapper) videoWrapper.classList.remove('playing');
    if(hint) hint.innerHTML = '<i class="fa-solid fa-play"></i> Click to Play';
    
    // Reset Data
    currentData = {
        quote: { id: null, solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
        character: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
        banner: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
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
            
            // FIX: Save specific Question IDs
            currentData.quote.id = data.quote_id;
            currentData.character.id = data.char_id;
            currentData.banner.id = data.banner_id;

            if(data.char_pixel_level) currentData.character.level = data.char_pixel_level;
            if(data.banner_pixel_level) currentData.banner.level = data.banner_pixel_level;

            if(videoEl) videoEl.src = data.video_path || ''; 
            window.stopTimestamp = data.stop_timestamp || 0;
            
            if(charImg) charImg.dataset.src = data.image_char_path || '';
            if(bannerImg) bannerImg.dataset.src = data.image_banner_path || '';

            window.updateInputState();
            renderImages();
        })
        .catch(err => console.error(err));
};

window.updateInputState = function() {
    if(!answerInput) return;

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

    if(charImg && charImg.dataset.src) {
        const url = `/api/image-proxy?path=${encodeURIComponent(charImg.dataset.src)}&level=${charState.solved ? 1.0 : charState.level}&t=${Date.now()}`;
        charImg.src = url;
    }
    
    if(bannerImg && bannerImg.dataset.src) {
        const url = `/api/image-proxy?path=${encodeURIComponent(bannerImg.dataset.src)}&level=${bannerState.solved ? 1.0 : bannerState.level}&t=${Date.now()}`;
        bannerImg.src = url;
    }
}

/* --- ANSWER CHECKING --- */
function checkAnswer() {
    if(!answerInput) return;

    const mode = window.currentMode;
    const state = currentData[mode];
    if (state.solved) return;

    const userGuess = answerInput.value;
    if (!userGuess) return;

    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    state.attempts++;

    // FIX: Send specific Question ID (state.id)
    fetch('/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            questionId: state.id, // Use the specific ID we saved earlier
            userGuess: userGuess,
            attempts: state.attempts, 
            hints: state.hintsUsed,
            timeTaken: timeTaken
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
                if(v) {
                    v.play();
                    const vw = document.querySelector('.video-wrapper');
                    if(vw) vw.classList.add('playing');
                }
            }
        } else {
            answerInput.classList.add('shake', 'wrong');
            setTimeout(() => answerInput.classList.remove('shake', 'wrong'), 500);
            window.revealHint(true);
        }
    });
}

window.revealHint = function(isAuto = false) {
    const state = currentData[window.currentMode];
    if (state.solved) return;
    
    if (!isAuto) state.hintsUsed++;

    if (state.level < 1.0) {
        state.level += 0.1;
        renderImages();
    }
};