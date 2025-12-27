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
    // Metadata from server
    title: "",
    stopTime: 0
};

// DOM Elements
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
    
    // Fetch from Server
    fetch(`/api/content/random?category=${category}`)
        .then(res => {
            if(!res.ok) throw new Error("No content");
            return res.json();
        })
        .then(data => {
            currentContentId = data.id;
            
            // Reset State for new content
            currentData = {
                quote: { solved: false, points: POINTS_BASE },
                character: { solved: false, level: 0.02, points: POINTS_BASE },
                banner: { solved: false, level: 0.02, points: POINTS_BASE },
                title: data.title,
                stopTime: data.stop_timestamp
            };

            // Setup Media
            const videoEl = document.getElementById('clip');
            videoEl.src = data.video_path; // Served from public/uploads/
            window.stopTimestamp = data.stop_timestamp;
            
            // Store image paths for pixelation logic
            charImg.dataset.src = data.image_char_path;
            bannerImg.dataset.src = data.image_banner_path;

            // Reset UI
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
        answerInput.value = "SOLVED"; // We assume server validated it
    } else {
        answerInput.disabled = false;
    }
};

function renderImages() {
    const charState = currentData.character;
    const bannerState = currentData.banner;

    if(charImg.dataset.src) 
        applyPixelationToImage(charImg, charImg.dataset.src, charState.solved ? 1.0 : charState.level);
    
    if(bannerImg.dataset.src) 
        applyPixelationToImage(bannerImg, bannerImg.dataset.src, bannerState.solved ? 1.0 : bannerState.level);
}

/* --- ANSWER CHECKING --- */
function checkAnswer() {
    const mode = window.currentMode;
    const state = currentData[mode];
    if (state.solved) return;

    const userGuess = answerInput.value;
    if (!userGuess) return;

    // Call API
    fetch('/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contentId: currentContentId,
            mode: mode,
            userGuess: userGuess,
            attempts: 1, // Logic needs enhancement to track attempts
            hints: 0
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            alert("Please Sign In to play!");
            return;
        }

        if (data.correct) {
            state.solved = true;
            answerInput.value = data.correctString;
            answerInput.classList.add('correct');
            renderImages();
            
            // Resume video if quote solved
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

/* --- PIXELATION --- */
function applyPixelationToImage(imgElement, src, factor) {
    if (factor >= 0.99) { imgElement.src = src; return; }
    const tempImg = new Image();
    tempImg.src = src;
    tempImg.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = Math.max(1, Math.floor(tempImg.width * factor));
        const h = Math.max(1, Math.floor(tempImg.height * factor));
        canvas.width = w; canvas.height = h;
        ctx.drawImage(tempImg, 0, 0, w, h);
        
        const lg = document.createElement('canvas');
        lg.width = tempImg.width; lg.height = tempImg.height;
        const lctx = lg.getContext('2d');
        lctx.imageSmoothingEnabled = false;
        lctx.drawImage(canvas, 0, 0, tempImg.width, tempImg.height);
        imgElement.src = lg.toDataURL();
    };
}

// Video Stop Logic
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