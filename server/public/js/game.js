/* --- STATE MANAGEMENT --- */
const POINTS_BASE = 100;
let userScore = 0;
let currentCategory = 'movie'; 
window.currentMode = 'quote'; 
window.stopTimestamp = 0;
let currentContentId = null; // Track DB ID

// Store current content data loaded from server
let currentData = {
    quote: { solved: false, points: POINTS_BASE },
    character: { solved: false, level: 0.02, points: POINTS_BASE },
    banner: { solved: false, level: 0.02, points: POINTS_BASE },
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
    
    // 1. CLEAR PREVIOUS CONTENT IMMEDIATELY
    // This prevents "Recep Ivedik" from showing up in the Series tab
    document.getElementById('char-img').src = ''; 
    document.getElementById('banner-img').src = '';
    document.getElementById('clip').src = '';
    
    // Reset Data State
    currentData = {
        quote: { solved: false, points: POINTS_BASE },
        character: { solved: false, level: 0.02, points: POINTS_BASE },
        banner: { solved: false, level: 0.02, points: POINTS_BASE },
        title: "",
        stopTime: 0
    };
    
    // Fetch from Server
    fetch(`/api/content/random?category=${category}`)
        .then(res => {
            if(!res.ok) throw new Error("No content");
            return res.json();
        })
        .then(data => {
            currentContentId = data.id;
            
            // ... (Rest of your existing data processing) ...
            currentData.title = data.title;
            currentData.stopTime = data.stop_timestamp;

            const videoEl = document.getElementById('clip');
            videoEl.src = data.video_path; 
            window.stopTimestamp = data.stop_timestamp;
            
            // Store dataset src
            charImg.dataset.src = data.image_char_path;
            bannerImg.dataset.src = data.image_banner_path;

            window.updateInputState();
            renderImages();
        })
        .catch(err => {
            console.error(err);
            // Optional: Show a "No Content" placeholder
            Swal.fire({
                icon: 'info',
                title: 'Empty Vault',
                text: `No content found for ${category.toUpperCase()} yet!`,
                background: '#1a1a1a',
                color: '#fff'
            });
        });
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

    fetch('/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contentId: currentContentId,
            mode: mode,
            userGuess: userGuess,
            attempts: 1, 
            hints: 0
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            Swal.fire({
                icon: 'info',
                title: 'Login Required',
                text: 'Please Sign In to play!',
                background: '#1a1a1a',
                color: '#fff',
                confirmButtonColor: '#ff2e63'
            });
            return;
        }

        if (data.correct) {
            state.solved = true;
            answerInput.value = data.correctString;
            answerInput.classList.add('correct');
            renderImages();
            
            if (mode === 'quote') {
                const v = document.getElementById('clip');
                v.play();
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