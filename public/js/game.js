const POINTS_BASE = 100;
let userScore = 0;
let currentCategory = 'movie';
window.currentMode = 'quote';
window.stopTimestamp = 0;
let currentContentId = null;
let startTime = Date.now();

let isDragMode = false;
let draggedTile = null;
let sourceSlot = null;

let currentData = {
    quote: { id: null, solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
    character: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    banner: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0 },
    title: "",
    stopTime: 0
};

let charImg, bannerImg, answerInput, submitBtn, answerSection, skipBtn, hintBtn;

window.addEventListener('DOMContentLoaded', () => {
    charImg = document.getElementById('char-img');
    bannerImg = document.getElementById('banner-img');
    answerSection = document.querySelector('.answer-section');
    answerInput = document.querySelector('.answer-input');
    submitBtn = document.querySelector('.submit-btn');
    skipBtn = document.getElementById('skip-btn');

    hintBtn = document.querySelector('.hint-btn');

    if (!charImg || !answerSection) return;

    loadCategoryContent('movie');

    submitBtn.addEventListener('click', () => {
        if (currentData[window.currentMode].solved) {
            loadCategoryContent(currentCategory);
        } else {
            checkAnswer();
        }
    });

    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            const mode = window.currentMode;
            if (currentData[mode].solved) return;

            currentData[mode].solved = true;
            
            if (mode !== 'quote') {
                renderImages();
            }

            const dragInterface = document.querySelector('.drag-interface');
            if (dragInterface) dragInterface.remove();

            if (answerInput) {
                answerInput.classList.remove('hidden');
                answerInput.disabled = true;
                answerInput.value = currentData[mode].answer || "Unknown";
                answerInput.classList.add('wrong');
            }

            if (hintBtn) hintBtn.classList.add('disabled');

            setTimeout(() => {
                loadCategoryContent(currentCategory);
            }, 2000);
        });
    }

    if (answerInput) {
        answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (currentData[window.currentMode].solved) {
                    loadCategoryContent(currentCategory);
                } else {
                    checkAnswer();
                }
            }
        });
    }

    const vidEl = document.getElementById('clip');
    if (vidEl) {
        vidEl.addEventListener('timeupdate', () => {
            if (!currentData || currentData.quote.solved) return;
            if (!vidEl.paused && vidEl.currentTime >= window.stopTimestamp) {
                vidEl.pause();
                vidEl.currentTime = window.stopTimestamp;
                const wrapper = document.querySelector('.video-wrapper');
                const hint = document.querySelector('.play-hint');
                if (wrapper) wrapper.classList.remove('playing');
                if (hint) hint.innerHTML = '<i class="fa-solid fa-pen"></i> Answer!';
            }
        });
        vidEl.addEventListener('ended', () => {
            if (currentData.quote.solved && window.currentMode === 'quote') {
                loadCategoryContent(currentCategory);
            }
        });
    }
});

window.loadCategoryContent = function (category) {
    currentCategory = category;
    startTime = Date.now();
    isDragMode = false;

    if (charImg) charImg.src = '';
    if (bannerImg) bannerImg.src = '';

    if (answerInput) {
        answerInput.value = '';
        answerInput.classList.remove('hidden', 'correct', 'wrong', 'shake');
        answerInput.disabled = false;
    }

    if (hintBtn) {
        hintBtn.classList.remove('disabled');
        hintBtn.disabled = false;
    }

    const existingDrag = document.querySelector('.drag-interface');
    if (existingDrag) existingDrag.remove();

    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        submitBtn.classList.remove('next-btn');
    }

    const videoEl = document.getElementById('clip');
    if (videoEl) videoEl.src = '';

    const videoWrapper = document.querySelector('.video-wrapper');
    const hint = document.querySelector('.play-hint');
    if (videoWrapper) videoWrapper.classList.remove('playing');
    if (hint) hint.innerHTML = '<i class="fa-solid fa-play"></i> Click to Play';

    const prevQuoteId = (currentData && currentData.quote) ? currentData.quote.id : '';
    const prevCharId = (currentData && currentData.character) ? currentData.character.id : '';
    const prevBannerId = (currentData && currentData.banner) ? currentData.banner.id : '';

    currentData = {
        quote: { id: null, solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
        character: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
        banner: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
        title: "",
        stopTime: 0
    };

    fetch(`/api/content/random?category=${category}&last_quote_id=${prevQuoteId}&last_char_id=${prevCharId}&last_banner_id=${prevBannerId}`)
        .then(res => {
            if (!res.ok) throw new Error("Network response was not ok");
            return res.json();
        })
        .then(data => {
            if (!data) return;

            currentContentId = data.id;
            currentData.title = data.quote_franchise_title || ""; 
            currentData.stopTime = data.stop_timestamp;

            currentData.quote.id = data.quote_id;
            currentData.quote.answer = data.answer_quote;

            currentData.character.id = data.char_id;
            currentData.character.answer = data.answer_char || data.char_franchise_title;

            currentData.banner.id = data.banner_id;
            currentData.banner.answer = data.answer_banner || data.banner_franchise_title;

            if (data.char_pixel_level) currentData.character.level = data.char_pixel_level;
            if (data.banner_pixel_level) currentData.banner.level = data.banner_pixel_level;

            if (videoEl) videoEl.src = data.video_path || '';
            window.stopTimestamp = data.stop_timestamp || 0;

            if (charImg) charImg.dataset.src = data.image_char_path || '';
            if (bannerImg) bannerImg.dataset.src = data.image_banner_path || '';

            renderImages();
        })
        .catch(err => console.error(err));
};

window.updateInputState = function () {
    const mode = window.currentMode;
    const state = currentData[mode];

    isDragMode = false;

    const existingDrag = document.querySelector('.drag-interface');
    if (existingDrag) existingDrag.remove();

    if (answerInput) {
        answerInput.classList.remove('hidden', 'correct', 'wrong', 'shake');
        answerInput.disabled = false;
        answerInput.value = "";
    }
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        submitBtn.classList.remove('next-btn');
    }
    if (hintBtn) hintBtn.classList.remove('disabled');

    if (state.solved) {
        if (answerInput) {
            answerInput.value = state.answer || "";
            answerInput.classList.add('correct');
            answerInput.disabled = true;
        }
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fa-solid fa-forward-step"></i>';
            submitBtn.classList.add('next-btn');
        }
        if (mode !== 'quote') renderImages();
        return;
    }

    let shouldTriggerDrag = false;
    let dndLevel = 0;

    if (mode === 'quote') {
        if (state.hintsUsed > 0) {
            shouldTriggerDrag = true;
            dndLevel = state.hintsUsed;
        }
        if (state.hintsUsed >= 4 && hintBtn) hintBtn.classList.add('disabled');

    } else {
        if (state.hintsUsed >= 6) {
            shouldTriggerDrag = true;
            dndLevel = state.hintsUsed - 5;

            if (hintBtn) hintBtn.classList.add('disabled');
        }
        
        renderImages();
    }

    if (shouldTriggerDrag) {
        isDragMode = true;
        setupDragDrop(state.answer, dndLevel);
    }
};

window.revealHint = function (isAuto = false) {
    const state = currentData[window.currentMode];
    if (state.solved) return;
    if (hintBtn && hintBtn.classList.contains('disabled')) return;

    // FIX: Increment hintsUsed even if isAuto is true.
    // This ensures the image actually unblurs when the game triggers a hint.
    state.hintsUsed++;

    if (window.currentMode === 'quote') {
        isDragMode = true;
        setupDragDrop(state.answer, state.hintsUsed);
        if (state.hintsUsed >= 4 && hintBtn) hintBtn.classList.add('disabled');

    } else {        
        // --- IMAGE MODES ---
        if (state.hintsUsed <= 5) {
            // Hints 1-4: Unblur
            // Hint 5: Clear Image
            renderImages();
            
        } else {
            // Hint 6 (Attempt 9): Start Drag & Drop
            isDragMode = true;
            
            // Calculate Level (Hint 6 starts at 1)
            const dndLevel = state.hintsUsed - 5; 
            setupDragDrop(state.answer, dndLevel);

            if (hintBtn) hintBtn.classList.add('disabled');
        }
    }
};

function setupDragDrop(answerText, hintLevel) {
    if (answerInput) answerInput.classList.add('hidden');

    const existingDrag = document.querySelector('.drag-interface');
    const isReshuffle = !!existingDrag;

    if (existingDrag) existingDrag.remove();

    const dragInterface = document.createElement('div');
    dragInterface.className = 'drag-interface';

    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'slots-container';

    const cleanAnswer = answerText.trim();
    const words = cleanAnswer.split(/\s+/);

    let globalBag = [];
    if (hintLevel <= 1) {
        globalBag = cleanAnswer.replace(/\s/g, '').split('').sort(() => Math.random() - 0.5);
    }

    let globalBagIndex = 0;
    let globalTileCount = 0;

    words.forEach((word) => {
        const wordGroup = document.createElement('div');
        wordGroup.className = 'word-group';

        if (isReshuffle && hintLevel >= 2) {
            wordGroup.classList.add('flash');
        }

        const trueLetters = word.split('');
        let lettersToDistribute = [];

        if (hintLevel <= 1) {
        } else {
            let temp = [...trueLetters];

            if (hintLevel >= 3) {
                const first = temp.shift();
                let last = null;
                if (hintLevel >= 4 && temp.length > 0) last = temp.pop();

                temp.sort(() => Math.random() - 0.5);

                lettersToDistribute = [first, ...temp];
                if (last) lettersToDistribute.push(last);
            } else {
                lettersToDistribute = temp.sort(() => Math.random() - 0.5);
            }
        }

        trueLetters.forEach((char, idx) => {
            const slot = document.createElement('div');
            slot.className = 'char-slot';

            let letterChar = '?';
            let isLocked = false;

            if (hintLevel <= 1) {
                letterChar = globalBag[globalBagIndex];
                globalBagIndex++;
            } else {
                letterChar = lettersToDistribute[idx];

                if (hintLevel >= 3 && idx === 0) isLocked = true;
                if (hintLevel >= 4 && idx === trueLetters.length - 1) isLocked = true;
            }

            const tile = document.createElement('div');
            tile.className = 'drag-tile';
            tile.textContent = letterChar;

            tile.classList.add('pop-in');
            tile.style.animationDelay = `${globalTileCount * 0.03}s`;

            if (isLocked) {
                tile.classList.add('locked-tile');
                slot.classList.add('locked');
            } else {
                tile.draggable = true;
                tile.addEventListener('dragstart', handleDragStart);
                tile.addEventListener('dragenter', handleDragEnter);
                tile.addEventListener('dragover', handleDragOver);
                tile.addEventListener('drop', handleDrop);
                tile.addEventListener('click', handleClickSwap);
            }

            slot.appendChild(tile);
            wordGroup.appendChild(slot);
            globalTileCount++;
        });

        slotsContainer.appendChild(wordGroup);
    });

    dragInterface.appendChild(slotsContainer);

    answerSection.insertBefore(dragInterface, submitBtn);
}

function handleDragStart(e) {
    draggedTile = e.target;
    sourceSlot = draggedTile.parentElement;
    e.target.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    if (draggedTile === e.target) return;

    let targetElement = e.target;

    if (targetElement.classList.contains('drag-tile')) {
        if (targetElement.classList.contains('locked-tile')) return;

        const targetSlot = targetElement.parentElement;

        sourceSlot.appendChild(targetElement);
        targetSlot.appendChild(draggedTile);
    } else if (targetElement.classList.contains('char-slot')) {
        targetElement.appendChild(draggedTile);
    }

    draggedTile.classList.remove('is-dragging');
}

let selectedTile = null;
function handleClickSwap(e) {
    const tile = e.target;
    if (tile.classList.contains('locked-tile')) return;

    if (!selectedTile) {
        selectedTile = tile;
        tile.style.backgroundColor = 'var(--secondary)';
    } else {
        const prevSlot = selectedTile.parentElement;
        const currSlot = tile.parentElement;

        prevSlot.appendChild(tile);
        currSlot.appendChild(selectedTile);

        selectedTile.style.backgroundColor = '';
        selectedTile = null;
    }
}

window.renderImages = function () {
    const charState = currentData.character;
    const bannerState = currentData.banner;

    const getUrl = (imgElement, state) => {
        if (!imgElement.dataset.src) return '';

        if (state.solved || state.hintsUsed >= 5) {
            return `/api/image-proxy?path=${encodeURIComponent(imgElement.dataset.src)}&level=1.0&t=${Date.now()}`;
        }

        return `/api/image-proxy?path=${encodeURIComponent(imgElement.dataset.src)}&hint=${state.hintsUsed}&t=${Date.now()}`;
    };

    if (charImg && charImg.dataset.src) {
        charImg.src = getUrl(charImg, charState);
    }

    if (bannerImg && bannerImg.dataset.src) {
        bannerImg.src = getUrl(bannerImg, bannerState);
    }
};

function checkAnswer() {
    const mode = window.currentMode;
    const state = currentData[mode];
    if (state.solved) return;

    let userGuess = "";

    if (isDragMode) {
        const slots = document.querySelectorAll('.char-slot .drag-tile');
        slots.forEach(tile => {
            userGuess += tile.textContent;
        });
    } else {
        if (!answerInput) return;
        userGuess = answerInput.value.replace(/\s+/g, '');
    }

    if (!userGuess) return;

    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    state.attempts++;

    fetch('/api/check-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            questionId: state.id,
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
            if (mode !== 'quote') renderImages();

            if (isDragMode) {
                const allSlots = document.querySelectorAll('.char-slot');
                allSlots.forEach((slot, index) => {
                    slot.classList.add('correct-state');
                    const tile = slot.querySelector('.drag-tile');
                    if (tile) {
                        tile.draggable = false;
                        tile.classList.add('locked-tile');
                        tile.style.animationDelay = `${index * 0.05}s`;
                        tile.classList.add('success-anim');
                    }
                });
            } else {
                answerInput.classList.add('correct');
                answerInput.value = data.correctString;
                answerInput.disabled = true;
            }

            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fa-solid fa-forward-step"></i>';
                submitBtn.classList.add('next-btn');
            }
            if (mode === 'quote') {
                const v = document.getElementById('clip');
                if(v) { v.currentTime = window.stopTimestamp; v.play(); }
                const vw = document.querySelector('.video-wrapper');
                if(vw) vw.classList.add('playing');
                const h = document.querySelector('.play-hint');
                if(h) h.innerHTML = '';
            }

        } else {
            if (isDragMode) {
                const con = document.querySelector('.slots-container');
                if (con) {
                    con.animate([
                        { transform: 'translateX(0)' }, { transform: 'translateX(-10px)' },
                        { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }
                    ], { duration: 400 });
                }
            } else {
                answerInput.classList.add('shake', 'wrong');
                setTimeout(() => answerInput.classList.remove('shake', 'wrong'), 500);
            }

            if (!isDragMode) {
                if (window.currentMode === 'quote') {
                    if (state.attempts >= 5) window.revealHint(true);
                } else {
                    if (state.attempts >= 3) {
                        window.revealHint(true); 
                    }
                }
            }
        }
    });
}