/* --- STATE MANAGEMENT --- */
const POINTS_BASE = 100;
let userScore = 0;
let currentCategory = 'movie';
window.currentMode = 'quote';
window.stopTimestamp = 0;
let currentContentId = null;
let startTime = Date.now();

// Track if we have switched from Input to Drag mode
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

// Added hintBtn here
let charImg, bannerImg, answerInput, submitBtn, answerSection, skipBtn, hintBtn;

/* --- INITIALIZATION --- */
window.addEventListener('DOMContentLoaded', () => {
    charImg = document.getElementById('char-img');
    bannerImg = document.getElementById('banner-img');
    answerSection = document.querySelector('.answer-section');
    answerInput = document.querySelector('.answer-input');
    submitBtn = document.querySelector('.submit-btn');
    skipBtn = document.getElementById('skip-btn');

    // Select Hint Button
    hintBtn = document.querySelector('.hint-btn');

    if (!charImg || !answerSection) return;

    loadCategoryContent('movie');

    // Submit Click
    submitBtn.addEventListener('click', () => {
        if (currentData[window.currentMode].solved) {
            loadCategoryContent(currentCategory);
        } else {
            checkAnswer();
        }
    });

    // Skip Logic
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            const mode = window.currentMode;
            if (currentData[mode].solved) return;

            currentData[mode].solved = true;
            const dragInterface = document.querySelector('.drag-interface');
            if (dragInterface) dragInterface.remove();

            if (answerInput) {
                answerInput.classList.remove('hidden');
                answerInput.disabled = true;
                answerInput.value = currentData[mode].answer || "Unknown";
                answerInput.classList.add('wrong');
            }

            // Lock hint button on skip
            if (hintBtn) hintBtn.classList.add('disabled');

            setTimeout(() => {
                loadCategoryContent(currentCategory);
            }, 1500);
        });
    }

    // Enter Key
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

    // Video Events
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

/* --- CORE FUNCTIONS --- */
window.loadCategoryContent = function (category) {
    currentCategory = category;
    startTime = Date.now();
    isDragMode = false; // Reset mode

    if (charImg) charImg.src = '';
    if (bannerImg) bannerImg.src = '';

    // Reset UI
    if (answerInput) {
        answerInput.value = '';
        answerInput.classList.remove('hidden', 'correct', 'wrong', 'shake');
        answerInput.disabled = false;
    }

    // Reset Hint Button
    if (hintBtn) {
        hintBtn.classList.remove('disabled');
        hintBtn.disabled = false;
    }

    // Remove any existing drag interface
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

    currentData = {
        quote: { id: null, solved: false, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
        character: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
        banner: { id: null, solved: false, level: 0.02, points: POINTS_BASE, attempts: 0, hintsUsed: 0, answer: "" },
        title: "",
        stopTime: 0
    };

    fetch(`/api/content/random?category=${category}`)
        .then(res => {
            if (!res.ok) throw new Error("Network response was not ok");
            return res.json();
        })
        .then(data => {
            if (!data) return;

            currentContentId = data.id;
            currentData.title = data.title;
            currentData.stopTime = data.stop_timestamp;

            // --- SAVE ANSWERS FOR ALL MODES ---
            currentData.quote.id = data.quote_id;
            currentData.quote.answer = data.answer_quote;

            currentData.character.id = data.char_id;
            // Use specific character answer if available, else title
            currentData.character.answer = data.answer_char || data.title;

            currentData.banner.id = data.banner_id;
            // Use specific banner answer if available, else title
            currentData.banner.answer = data.answer_banner || data.title;

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

/* --- HINT LOGIC --- */
window.revealHint = function (isAuto = false) {
    const state = currentData[window.currentMode];
    if (state.solved) return;

    if (hintBtn && hintBtn.classList.contains('disabled')) return;

    if (!isAuto) state.hintsUsed++;

    // --- QUOTE MODE LOGIC (Immediate D&D) ---
    if (window.currentMode === 'quote') {
        isDragMode = true;
        setupDragDrop(state.answer, state.hintsUsed);

        // Max Hint Lock (Level 4)
        if (state.hintsUsed >= 4 && hintBtn) {
            hintBtn.classList.add('disabled');
        }
    }
    // --- IMAGE MODES LOGIC (Progressive Reveal -> Then D&D) ---
    else {
        // Logic: 
        // Hints 1-4: Pixelate Less
        // Hint 5: Clear Image
        // Hint 6: Drag & Drop
        // Hint 7+: Better D&D Hints

        if (state.hintsUsed <= 4) {
            // PIXELATION PHASE
            // Steps: 0.02 -> 0.25 -> 0.5 -> 0.75 -> 0.9 (approx)
            state.level = 0.02 + (state.hintsUsed * 0.2);
            renderImages();
        }
        else if (state.hintsUsed === 5) {
            // CLEAR IMAGE PHASE
            state.level = 1.0;
            renderImages();
        }
        else {
            // DRAG & DROP PHASE (Hint 6+)
            isDragMode = true;

            // We map "Hints Used" to "D&D Level"
            // Hint 6 -> D&D Level 1 (Global Shuffle)
            // Hint 7 -> D&D Level 2 (Word Shuffle)
            // etc.
            const dndLevel = state.hintsUsed - 5;
            setupDragDrop(state.answer, dndLevel);

            // Lock if we max out D&D hints (Level 4 = Hint 9 total)
            if (dndLevel >= 4 && hintBtn) {
                hintBtn.classList.add('disabled');
            }
        }
    }
};

/* --- DRAG & DROP GENERATOR --- */
function setupDragDrop(answerText, hintLevel) {
    // 1. Hide Text Input
    if (answerInput) answerInput.classList.add('hidden');

    // CHECK IF THIS IS AN UPDATE (ANIMATION LOGIC)
    const existingDrag = document.querySelector('.drag-interface');
    const isReshuffle = !!existingDrag;

    // 2. Clear old interface
    if (existingDrag) existingDrag.remove();

    // 3. Create Container
    const dragInterface = document.createElement('div');
    dragInterface.className = 'drag-interface';

    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'slots-container';

    // 4. Parse Words
    const cleanAnswer = answerText.trim();
    const words = cleanAnswer.split(/\s+/);

    // --- SHUFFLE LOGIC ---
    let globalBag = [];
    if (hintLevel <= 1) {
        // Global Shuffle (Hard)
        globalBag = cleanAnswer.replace(/\s/g, '').split('').sort(() => Math.random() - 0.5);
    }

    let globalBagIndex = 0;
    let globalTileCount = 0;

    // --- BUILD SLOTS ---
    words.forEach((word) => {
        const wordGroup = document.createElement('div');
        wordGroup.className = 'word-group';

        if (isReshuffle && hintLevel >= 2) {
            wordGroup.classList.add('flash');
        }

        const trueLetters = word.split('');
        let lettersToDistribute = [];

        if (hintLevel <= 1) {
            // Global Mode handled in loop
        } else {
            let temp = [...trueLetters];

            // Handle Locked Letters
            if (hintLevel >= 3) {
                const first = temp.shift();
                let last = null;
                if (hintLevel >= 4 && temp.length > 0) last = temp.pop(); // Remove last

                temp.sort(() => Math.random() - 0.5); // Shuffle middle

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

                // DETERMINE LOCKS
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

    // Insert before Submit
    answerSection.insertBefore(dragInterface, submitBtn);
}

/* --- DRAG EVENTS (SWAP LOGIC) --- */
function handleDragStart(e) {
    draggedTile = e.target;
    sourceSlot = draggedTile.parentElement;
    e.target.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = "move";
}

function handleDragOver(e) {
    e.preventDefault(); // Allow drop
    e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.stopPropagation(); // Stop bubbling
    e.preventDefault();

    if (draggedTile === e.target) return; // Dropped on self

    // Resolve the target slot
    let targetElement = e.target;

    // If we dropped on a tile, we want to swap
    if (targetElement.classList.contains('drag-tile')) {
        if (targetElement.classList.contains('locked-tile')) return; // Cannot swap with locked

        const targetSlot = targetElement.parentElement;

        // SWAP TILES
        sourceSlot.appendChild(targetElement); // Move target to source
        targetSlot.appendChild(draggedTile);   // Move dragged to target
    }
    // If we dropped on an empty slot (unlikely in pre-filled mode but possible)
    else if (targetElement.classList.contains('char-slot')) {
        targetElement.appendChild(draggedTile);
    }

    draggedTile.classList.remove('is-dragging');
}

// Click to move (Simple fallback for mobile if drag fails)
let selectedTile = null;
function handleClickSwap(e) {
    const tile = e.target;
    if (tile.classList.contains('locked-tile')) return;

    if (!selectedTile) {
        // Select
        selectedTile = tile;
        tile.style.backgroundColor = 'var(--secondary)';
    } else {
        // Swap
        const prevSlot = selectedTile.parentElement;
        const currSlot = tile.parentElement;

        prevSlot.appendChild(tile);
        currSlot.appendChild(selectedTile);

        // Reset
        selectedTile.style.backgroundColor = '';
        selectedTile = null;
    }
}

/* --- IMAGES & CHECK ANSWER --- */
window.renderImages = function () {
    const charState = currentData.character;
    const bannerState = currentData.banner;

    if (charImg && charImg.dataset.src) {
        const url = `/api/image-proxy?path=${encodeURIComponent(charImg.dataset.src)}&level=${charState.solved ? 1.0 : charState.level}&t=${Date.now()}`;
        charImg.src = url;
    }

    if (bannerImg && bannerImg.dataset.src) {
        const url = `/api/image-proxy?path=${encodeURIComponent(bannerImg.dataset.src)}&level=${bannerState.solved ? 1.0 : bannerState.level}&t=${Date.now()}`;
        bannerImg.src = url;
    }
}

function checkAnswer() {
    const mode = window.currentMode;
    const state = currentData[mode];
    if (state.solved) return;

    let userGuess = "";

    // CHECK INPUT METHOD
    if (isDragMode) {
        // Construct string from slots
        const slots = document.querySelectorAll('.char-slot .drag-tile');
        slots.forEach(tile => {
            userGuess += tile.textContent;
        });
    } else {
        // Read from Input
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
                    // --- SUCCESS ANIMATION LOGIC ---
                    const allSlots = document.querySelectorAll('.char-slot');

                    allSlots.forEach((slot, index) => {
                        // 1. Mark Slot as correct (for border color)
                        slot.classList.add('correct-state');

                        const tile = slot.querySelector('.drag-tile');
                        if (tile) {
                            // 2. Lock Tile
                            tile.draggable = false;
                            tile.classList.add('locked-tile');

                            // 3. Apply Staggered Animation
                            // We set the delay via inline style so it flows left-to-right
                            tile.style.animationDelay = `${index * 0.05}s`; // 0.05s delay per tile
                            tile.classList.add('success-anim');
                        }
                    });

                } else {
                    // Text Input Success
                    answerInput.classList.add('correct');
                    answerInput.value = data.correctString;
                    answerInput.disabled = true;
                }

                // Change Submit Button to Next
                if (submitBtn) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-forward-step"></i>';
                    submitBtn.classList.add('next-btn');
                }

                // Play Video / Cleanup
                if (mode === 'quote') {
                    const v = document.getElementById('clip');
                    if (v) {
                        v.currentTime = window.stopTimestamp;
                        v.play();
                        const vw = document.querySelector('.video-wrapper');
                        if (vw) vw.classList.add('playing');
                        const hint = document.querySelector('.play-hint');
                        if (hint) hint.innerHTML = '';
                    }
                }
            } else {
                // Error Feedback
                if (isDragMode) {
                    const con = document.querySelector('.slots-container');
                    if (con) {
                        con.animate([
                            { transform: 'translateX(0)' },
                            { transform: 'translateX(-10px)' },
                            { transform: 'translateX(10px)' },
                            { transform: 'translateX(0)' }
                        ], { duration: 400 });
                    }
                } else {
                    answerInput.classList.add('shake', 'wrong');
                    setTimeout(() => answerInput.classList.remove('shake', 'wrong'), 500);
                }

                // AUTO-TRIGGER LOGIC
                // If attempts >= 5, force hints to a level where D&D is active
                if (!isDragMode && state.attempts >= 5) {
                    if (window.currentMode === 'quote') {
                        window.revealHint(true);
                    } else {
                        // For Images: Skip to Hint 6 (Drag & Drop) directly
                        // We set hintsUsed to 6 so the D&D logic picks up correctly
                        state.hintsUsed = 6;
                        // Also ensure image is clear
                        state.level = 1.0;
                        renderImages();
                        // Trigger D&D
                        isDragMode = true;
                        setupDragDrop(state.answer, 1); // Level 1 D&D
                    }
                }
            }
        });
}