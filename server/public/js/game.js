/* --- MOCK BACKEND DATA --- */
const contentDatabase = {
    movie: {
        path: './temp-content/movie',
        quoteVid: 'quotevid.mp4',
        character: 'character.png',
        banner: 'banner.png',
        stopTime: { min: 0, sec: 10, ms: 500 },
        quoteAnswer: "Salih abi bana bir yolluk yap",
        characterAnswer: "Recep İvedik",
        bannerAnswer: "Recep İvedik 1"
    },
    series: {
        path: './temp-content/series',
        quoteVid: 'quotevid.mp4',
        character: 'character.png',
        banner: 'banner.png',
        stopTime: { min: 0, sec: 5, ms: 0 },
        quoteAnswer: "Say my name",
        characterAnswer: "Jesse Pinkman",
        bannerAnswer: "Breaking Bad"
    },
    game: {
        path: './temp-content/game',
        quoteVid: 'quotevid.mp4',
        character: 'character.png',
        banner: 'banner.png',
        stopTime: { min: 0, sec: 15, ms: 200 },
        quoteAnswer: "The cake is a lie",
        characterAnswer: "GLaDOS",
        bannerAnswer: "Portal"
    }
};

/* --- STATE MANAGEMENT --- */
const POINTS_BASE = 100;
const HINT_PENALTY = 15;
const WRONG_GUESS_PENALTY = 10;

let userScore = 0;
let currentCategory = 'movie';
window.currentMode = 'quote';
window.stopTimestamp = 0;

const gameProgress = {
    movie: {
        quote: { solved: false, points: POINTS_BASE },
        character: { solved: false, level: 0.02, points: POINTS_BASE },
        banner: { solved: false, level: 0.02, points: POINTS_BASE }
    },
    series: {
        quote: { solved: false, points: POINTS_BASE },
        character: { solved: false, level: 0.02, points: POINTS_BASE },
        banner: { solved: false, level: 0.02, points: POINTS_BASE }
    },
    game: {
        quote: { solved: false, points: POINTS_BASE },
        character: { solved: false, level: 0.02, points: POINTS_BASE },
        banner: { solved: false, level: 0.02, points: POINTS_BASE }
    }
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

// 1. Load Content
window.loadCategoryContent = function (category) {
    currentCategory = category;
    const data = contentDatabase[category];

    // Update Input State
    window.updateInputState();

    // Reset Play Hint Text
    const hintEl = document.querySelector('.play-hint');
    if (hintEl) {
        if (gameProgress[category].quote.solved) {
            hintEl.style.display = 'none';
        } else {
            hintEl.innerHTML = '<i class="fa-solid fa-play"></i> Click to Play';
            hintEl.style.display = 'flex';
            hintEl.style.opacity = '1'; // Ensure it's visible on load
        }
    }

    // Setup Video
    window.stopTimestamp = (data.stopTime.min * 60) + data.stopTime.sec + (data.stopTime.ms / 1000);
    const videoEl = document.getElementById('clip');
    if (videoEl) {
        videoEl.src = `${data.path}/${data.quoteVid}`;
        videoEl.load();
        videoEl.currentTime = 0;
        const wrapper = document.querySelector('.video-wrapper');
        if (wrapper) wrapper.classList.remove('playing');
    }

    renderImages();
};

// 2. Update Input State
window.updateInputState = function () {
    const state = gameProgress[currentCategory][window.currentMode];
    answerInput.classList.remove('correct', 'wrong', 'shake');

    if (window.currentMode === 'quote') {
        answerInput.placeholder = "Guess the Quote...";
    } else if (window.currentMode === 'character') {
        answerInput.placeholder = "Name the Character...";
    } else if (window.currentMode === 'banner') {
        answerInput.placeholder = "Guess the Title from the Art...";
    }

    if (state.solved) {
        answerInput.value = getCorrectAnswerString();
        answerInput.classList.add('correct');
        answerInput.disabled = true;
    } else {
        answerInput.value = '';
        answerInput.disabled = false;
    }
};

// 3. Render Images Logic
function renderImages() {
    const charState = gameProgress[currentCategory].character;
    const bannerState = gameProgress[currentCategory].banner;
    const data = contentDatabase[currentCategory];

    const charPath = `${data.path}/${data.character}`;
    const bannerPath = `${data.path}/${data.banner}`;

    // STRICT CHECK: Only show clear image if specifically solved
    const charLevel = charState.solved === true ? 1.0 : charState.level;
    const bannerLevel = bannerState.solved === true ? 1.0 : bannerState.level;

    applyPixelationToImage(charImg, charPath, charLevel);
    applyPixelationToImage(bannerImg, bannerPath, bannerLevel);
}

/* --- ANSWER CHECKING --- */
function checkAnswer() {
    const state = gameProgress[currentCategory][window.currentMode];
    if (state.solved) return;

    let userGuess = answerInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    let correctAnswer = getCorrectAnswerString().toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!userGuess) return;

    if (userGuess === correctAnswer) {
        handleCorrectAnswer();
    } else {
        handleWrongAnswer();
    }
}

function getCorrectAnswerString() {
    const data = contentDatabase[currentCategory];
    if (window.currentMode === 'quote') return data.quoteAnswer;
    if (window.currentMode === 'character') return data.characterAnswer;
    if (window.currentMode === 'banner') return data.bannerAnswer;
    return "";
}

function handleCorrectAnswer() {
    const currentState = gameProgress[currentCategory][window.currentMode];
    currentState.solved = true;
    userScore += currentState.points;
    console.log(`Correct! Score: ${userScore} (+${currentState.points})`);

    answerInput.classList.remove('shake', 'wrong');
    answerInput.classList.add('correct');
    answerInput.disabled = true;
    answerInput.value = getCorrectAnswerString();

    renderImages();

    // Visual Feedback: Resume video and hide hint
    if (window.currentMode === 'quote') {
        const video = document.getElementById('clip');
        const hintEl = document.querySelector('.play-hint');
        if (video) {
            video.play();
            document.querySelector('.video-wrapper').classList.add('playing');
        }
        if (hintEl) hintEl.style.display = 'none';
    }
}

function handleWrongAnswer() {
    const currentState = gameProgress[currentCategory][window.currentMode];
    currentState.points = Math.max(0, currentState.points - WRONG_GUESS_PENALTY);

    answerInput.classList.remove('shake', 'correct');
    answerInput.classList.add('wrong');
    void answerInput.offsetWidth;
    answerInput.classList.add('shake');

    // Auto-Hint
    if (window.currentMode !== 'quote') {
        window.revealHint(true);
    }
}

/* --- HINT LOGIC --- */
window.revealHint = function (isAuto = false) {
    const state = gameProgress[currentCategory][window.currentMode];
    if (state.solved) return;

    if (!isAuto) {
        state.points = Math.max(0, state.points - HINT_PENALTY);
    }

    if (state.level < 1.0) {
        state.level += 0.1;
        if (state.level > 1) state.level = 1;
        renderImages();
    }
};

/* --- PIXELATION ENGINE --- */
function applyPixelationToImage(imgElement, src, factor) {
    if (factor >= 0.99) {
        imgElement.src = src;
        return;
    }

    const tempImg = new Image();
    tempImg.src = src;
    tempImg.crossOrigin = "Anonymous";

    tempImg.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const w = Math.max(1, Math.floor(tempImg.width * factor));
        const h = Math.max(1, Math.floor(tempImg.height * factor));

        canvas.width = w; canvas.height = h;
        ctx.drawImage(tempImg, 0, 0, w, h);

        const largeCanvas = document.createElement('canvas');
        largeCanvas.width = tempImg.width; largeCanvas.height = tempImg.height;
        const largeCtx = largeCanvas.getContext('2d');
        largeCtx.imageSmoothingEnabled = false;
        largeCtx.drawImage(canvas, 0, 0, tempImg.width, tempImg.height);

        imgElement.src = largeCanvas.toDataURL();
    };
}

/* --- VIDEO STOP LOGIC --- */
const vidEl = document.getElementById('clip');
if (vidEl) {
    vidEl.addEventListener('timeupdate', () => {
        if (gameProgress[currentCategory] && gameProgress[currentCategory].quote.solved) {
            return;
        }

        if (!vidEl.paused && vidEl.currentTime >= window.stopTimestamp) {
            vidEl.pause();
            vidEl.currentTime = window.stopTimestamp;
            const wrapper = document.querySelector('.video-wrapper');
            if (wrapper) wrapper.classList.remove('playing');

            const hintEl = document.querySelector('.play-hint');
            if (hintEl) {
                // FIXED HERE: Added opacity = '1'
                hintEl.innerHTML = '<i class="fa-solid fa-pen"></i> Answer!';
                hintEl.style.display = 'flex';
                hintEl.style.opacity = '1';
            }
        }
    });
}