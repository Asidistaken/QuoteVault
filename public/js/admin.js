// CONFIG FOR SWEETALERT TO PREVENT LAYOUT SHIFT
const swal = Swal.mixin({
    heightAuto: false,
    scrollbarPadding: false,
    background: '#222',
    color: '#fff',
    confirmButtonColor: '#ff2e63'
});

let currentTags = [];
let currentCategory = 'movie';
let currentFilter = 'all';

window.onload = () => {
    searchContent();
    loadTagSuggestions();
    addQuoteItem();
    addCharItem();
    addBannerItem();
};

// --- 1. SEARCH & LIST ---
function filterList(type, el) {
    currentFilter = type;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    searchContent();
}

async function searchContent() {
    const q = document.getElementById('searchInput').value;
    const res = await fetch(`/api/admin/search?query=${q}&type=${currentFilter}`);
    const data = await res.json();
    const list = document.getElementById('contentList');
    list.innerHTML = '';

    data.forEach(item => {
        let icon = 'fa-film';
        if (item.category === 'series') icon = 'fa-tv';
        if (item.category === 'game') icon = 'fa-gamepad';

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
                    <span class="item-title">${item.title}</span>
                    <span class="item-spacer"></span>
                    <i class="fa-solid ${icon} item-icon"></i>
                `;
        div.onclick = () => loadEdit(item);
        list.appendChild(div);
    });
}

function setCategory(cat) {
    currentCategory = cat;
    document.body.className = 'theme-' + cat;
    document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
        if (b.innerText.toLowerCase() === cat) b.classList.add('active');
    });
    const displayCat = cat.charAt(0).toUpperCase() + cat.slice(1);
    document.getElementById('btnSaveText').innerText = `Save ${displayCat}`;
}

// --- 2. DYNAMIC LIST RENDERING (UPDATED) ---
const uuid = () => 'id-' + Math.random().toString(36).substr(2, 9);

// NEW: SweetAlert Confirmation before removing from DOM
function confirmRemoveCard(id) {
    swal.fire({
        title: 'Remove this item?',
        text: "It will be removed from this list. (Click Save to apply changes).",
        icon: 'warning',
        background: '#222',
        color: '#fff',
        showCancelButton: true,
        confirmButtonColor: '#ff2e63',
        cancelButtonColor: '#444',
        confirmButtonText: 'Yes, remove it'
    }).then((result) => {
        if (result.isConfirmed) {
            const card = document.getElementById(id);
            if (card) {
                card.style.transition = 'opacity 0.3s, transform 0.3s';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => card.remove(), 300); // Wait for animation
            }
        }
    });
}

function addQuoteItem(data = {}) {
    const domId = uuid();
    const id = data.id || domId; // This is used for DOM ID
    const dbId = data.id || '';  // This is the actual Database ID

    const html = `
        <div class="card quote-card" id="${id}">
            <input type="hidden" class="inp-db-id" value="${dbId}"> 

            <div class="media-container">
                <button class="btn-remove" onclick="confirmRemoveCard('${id}')" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>

                <div class="placeholder-text video-ph" style="${data.path ? 'display:none' : ''}">
                    <i class="fa-solid fa-film"></i> No Video
                </div>
                <video class="vid-preview" controls src="${data.path || ''}" style="${data.path ? 'display:block' : 'display:none'}"></video>
                
                <button class="btn-upload" onclick="triggerUpload('${id}', '.file-video')">
                    <i class="fa-solid fa-upload"></i>
                </button>
            </div>
            <input type="file" class="file-video" accept="video/*" hidden onchange="handleListVideo(this, '${id}')">
            <input type="text" class="form-input inp-time" placeholder="Stop Time (e.g. 14.5)" value="${data.stop || ''}">
            <input type="text" class="form-input inp-quote" class="inp-answer" placeholder="Correct Quote" value="${data.answer || ''}">
            </div>
    `;
    document.getElementById('list-quotes').insertAdjacentHTML('beforeend', html);
}

function addCharItem(data = {}) {
    const domId = uuid();
    const id = data.id || domId;
    const dbId = data.id || ''; 
    const level = data.level !== undefined ? data.level * 100 : 100;

    const html = `
        <div class="card char-card" id="${id}">
            <input type="hidden" class="inp-db-id" value="${dbId}">

            <div class="media-container">
                <button class="btn-remove" onclick="confirmRemoveCard('${id}')" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>

                <div class="placeholder-text img-ph">
                    <i class="fa-regular fa-user"></i> No Image
                </div>
                <canvas class="cv-preview" style="display:none;"></canvas>
                <img class="raw-preview" style="display:none;">
                
                <button class="btn-upload" onclick="triggerUpload('${id}', '.file-img')">
                    <i class="fa-solid fa-upload"></i>
                </button>
            </div>
            <input type="file" class="file-img" accept="image/*" hidden onchange="handleListImage(this, '${id}')">
            
            <div class="slider-container">
                <div class="slider-header"><span>Clarity</span> <i class="fa-solid fa-eye"></i></div>
                <div class="slider-row">
                    <input type="range" class="rng-pixel" min="1" max="100" value="${level}" 
                           oninput="syncListPixel('${id}', this.value)">
                    <input type="number" class="slider-number num-pixel" min="1" max="100" value="${level}" 
                           oninput="syncListPixel('${id}', this.value)">
                </div>
            </div>
            <input type="text" class="form-input inp-answer" placeholder="Character Name" value="${data.answer || ''}">
        </div>
    `;
    document.getElementById('list-chars').insertAdjacentHTML('beforeend', html);
    if (data.path) loadListImage(id, data.path, data.level);
}

function addBannerItem(data = {}) {
    const domId = uuid();
    const id = data.id || domId;
    const dbId = data.id || ''; 
    const level = data.level !== undefined ? data.level * 100 : 100;

    const html = `
        <div class="card banner-card" id="${id}">
            <input type="hidden" class="inp-db-id" value="${dbId}">

            <div class="media-container">
                <button class="btn-remove" onclick="confirmRemoveCard('${id}')" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>

                <div class="placeholder-text img-ph">
                    <i class="fa-regular fa-image"></i> No Image
                </div>
                <canvas class="cv-preview" style="display:none;"></canvas>
                <img class="raw-preview" style="display:none;">
                
                <button class="btn-upload" onclick="triggerUpload('${id}', '.file-img')">
                    <i class="fa-solid fa-upload"></i>
                </button>
            </div>
            <input type="file" class="file-img" accept="image/*" hidden onchange="handleListImage(this, '${id}')">
            
            <div class="slider-container">
                <div class="slider-header"><span>Clarity</span> <i class="fa-solid fa-eye"></i></div>
                <div class="slider-row">
                    <input type="range" class="rng-pixel" min="1" max="100" value="${level}" 
                           oninput="syncListPixel('${id}', this.value)">
                    <input type="number" class="slider-number num-pixel" min="1" max="100" value="${level}" 
                           oninput="syncListPixel('${id}', this.value)">
                </div>
            </div>
        </div>
    `;
    document.getElementById('list-banners').insertAdjacentHTML('beforeend', html);
    if (data.path) loadListImage(id, data.path, data.level);
}

// --- 3. MEDIA HANDLING ---
function triggerUpload(cardId, selector) {
    // FIX: Use getElementById to safely handle numeric IDs (e.g. "1")
    const card = document.getElementById(cardId);
    if (card) {
        card.querySelector(selector).click();
    }
}

function handleListVideo(input, cardId) {
    const f = input.files[0];
    if (f) {
        const card = document.getElementById(cardId);
        card.querySelector('.video-ph').style.display = 'none';
        const v = card.querySelector('.vid-preview');
        v.style.display = 'block';
        v.src = URL.createObjectURL(f);
    }
}
function loadListVideo(cardId, path) {
    const card = document.getElementById(cardId);
    card.querySelector('.video-ph').style.display = 'none';
    const v = card.querySelector('.vid-preview');
    v.style.display = 'block';
    v.src = path;
}

function handleListImage(input, cardId) {
    const f = input.files[0];
    if (f) {
        const card = document.getElementById(cardId);
        const raw = card.querySelector('.raw-preview');
        raw.src = URL.createObjectURL(f);
        raw.onload = () => {
            card.querySelector('.img-ph').style.display = 'none';
            card.querySelector('.cv-preview').style.display = 'block';
            syncListPixel(cardId, 100);
        };
    }
}
function loadListImage(cardId, path, level) {
    const card = document.getElementById(cardId);
    const raw = card.querySelector('.raw-preview');
    raw.src = path;
    raw.onload = () => {
        card.querySelector('.img-ph').style.display = 'none';
        card.querySelector('.cv-preview').style.display = 'block';
        const val = level ? level * 100 : 100;
        syncListPixel(cardId, val);
    };
}

function syncListPixel(cardId, val) {
    val = parseInt(val);
    if (val > 100) val = 100; if (val < 1) val = 1;

    const card = document.getElementById(cardId);
    card.querySelector('.rng-pixel').value = val;
    card.querySelector('.num-pixel').value = val;

    const raw = card.querySelector('.raw-preview');
    const cv = card.querySelector('.cv-preview');
    const ctx = cv.getContext('2d');

    if (!raw.src) return;

    cv.width = raw.naturalWidth;
    cv.height = raw.naturalHeight;

    const targetLevel = val / 100;

    if (targetLevel >= 0.95) {
        ctx.drawImage(raw, 0, 0);
    } else {
        const MAX_BLOCK_SIZE = 50;

        // --- UPDATED MATH (MATCHES SERVER) ---
        // Removed Math.sqrt to keep the last steps from being too clear
        let pixelSize = Math.floor(MAX_BLOCK_SIZE * (1.0 - targetLevel));
        
        pixelSize = Math.max(2, pixelSize);

        const reducedWidth = Math.max(1, Math.round(cv.width / pixelSize));
        const reducedHeight = Math.max(1, Math.round(cv.height / pixelSize));

        ctx.imageSmoothingEnabled = true; // Use smooth downscaling
        ctx.drawImage(raw, 0, 0, reducedWidth, reducedHeight);

        ctx.imageSmoothingEnabled = false; // Use nearest-neighbor upscaling
        ctx.drawImage(cv, 0, 0, reducedWidth, reducedHeight, 0, 0, cv.width, cv.height);
    }
}

// --- 4. LOAD & RESET ---
function loadEdit(item) {
    resetForm();
    document.getElementById('editContentId').value = item.id;
    setCategory(item.category);
    document.getElementById('metaTitle').value = item.title;

    // Show Delete Button (now located in the header)
    document.getElementById('btnDelete').style.display = 'flex';

    // Loop through questions...
    document.getElementById('list-quotes').innerHTML = '';
    document.getElementById('list-chars').innerHTML = '';
    document.getElementById('list-banners').innerHTML = '';

    item.questions.forEach(q => {
        if (q.type === 'quote') {
            addQuoteItem({ id: q.id, path: q.media_path, stop: q.stop_time, answer: q.answer });
        } else if (q.type === 'character') {
            addCharItem({ id: q.id, path: q.media_path, answer: q.answer, level: q.pixel_level });
        } else if (q.type === 'banner') {
            addBannerItem({ id: q.id, path: q.media_path, level: q.pixel_level });
        }
    });

    // Add empty cards if needed
    if (document.getElementById('list-quotes').children.length === 0) addQuoteItem();
    if (document.getElementById('list-chars').children.length === 0) addCharItem();
    if (document.getElementById('list-banners').children.length === 0) addBannerItem();

    currentTags = item.tags || [];
    renderTags();
}

function resetForm() {
    document.getElementById('editContentId').value = '';
    document.getElementById('metaTitle').value = '';
    document.getElementById('tagInput').value = '';

    document.getElementById('list-quotes').innerHTML = '';
    document.getElementById('list-chars').innerHTML = '';
    document.getElementById('list-banners').innerHTML = '';

    document.getElementById('tagContainer').innerHTML = '';

    document.getElementById('btnSaveText').innerText = 'Save Movie';

    // Hide delete button (Updated ID reference)
    const btnDelete = document.getElementById('btnDelete');
    if (btnDelete) btnDelete.style.display = 'none';
}

// --- 5. TAGS ---
async function loadTagSuggestions() {
    const input = document.getElementById('tagInput');
    input.addEventListener('input', async () => {
        const res = await fetch(`/api/admin/tags?q=${input.value}`);
        const tags = await res.json();
        const dl = document.getElementById('tagListSuggestions');
        dl.innerHTML = '';
        tags.forEach(t => dl.appendChild(new Option(t)));
    });
}
function addTag() {
    const v = document.getElementById('tagInput').value.trim();
    if (v && !currentTags.includes(v)) {
        currentTags.push(v);
        renderTags();
        document.getElementById('tagInput').value = '';
    }
}
function renderTags() {
    const c = document.getElementById('tagContainer');
    c.innerHTML = '';
    currentTags.forEach(t => {
        const tag = document.createElement('div');
        tag.className = 'tag-chip';
        tag.innerHTML = `${t} <span onclick="removeTag('${t}')">&times;</span>`;
        c.appendChild(tag);
    });
}
function removeTag(t) { currentTags = currentTags.filter(x => x !== t); renderTags(); }

// Helper to visually alert the user to the specific input
function highlightError(inputElement) {
    if (!inputElement) return;
    
    // Scroll to the empty input so the user sees it
    inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add visual error styles (Shake + Red Border)
    inputElement.classList.add('shake');
    inputElement.style.borderColor = '#ff2e63';
    
    // Remove styles after animation
    setTimeout(() => {
        inputElement.classList.remove('shake');
        inputElement.style.borderColor = '';
    }, 2000);
}

// --- 6. SAVE (FIXED: Loader only appears after validation passes) ---
async function saveContent() {
    // 1. Validate Main Title
    const titleInput = document.getElementById('metaTitle');
    const titleVal = titleInput.value.trim();

    if (!titleVal) {
        highlightError(titleInput);
        swal.fire({
            icon: 'error',
            title: 'Missing Title',
            text: 'Please enter a Franchise Title before saving.',
            confirmButtonText: 'OK',
            showConfirmButton: true
        });
        return;
    }

    // --- MOVED LOADING SCREEN FROM HERE --- 
    // We do NOT show the loader yet. We validate the list first.

    const formData = new FormData();
    const id = document.getElementById('editContentId').value;

    formData.append('id', id);
    formData.append('title', titleVal);

    const activeBtn = document.querySelector('.type-btn.active');
    const category = activeBtn ? activeBtn.innerText.toLowerCase() : 'movie';
    formData.append('category', category);

    // Tags
    formData.append('tags', JSON.stringify(currentTags)); 

    const contentItems = [];
    let validationError = false; 

    const processList = (listId, type) => {
        if (validationError) return; 

        const container = document.getElementById(listId);
        const items = container.querySelectorAll('.card');

        items.forEach((itemDiv, index) => {
            if (validationError) return;

            // Selectors
            const dbIdInput = itemDiv.querySelector('.inp-db-id');
            const fileInput = itemDiv.querySelector('.inp-file') || itemDiv.querySelector('.file-video') || itemDiv.querySelector('.file-img');
            
            const answerInput = itemDiv.querySelector('.inp-answer') || itemDiv.querySelector('.inp-quote');
            const timeInput = itemDiv.querySelector('.inp-time');
            const pixelInput = itemDiv.querySelector('.inp-pixel') || itemDiv.querySelector('.rng-pixel');

            // Get Values
            const answerVal = answerInput ? answerInput.value.trim() : '';
            const timeVal = timeInput ? timeInput.value.trim() : '';

            // --- VALIDATION LOGIC ---
            
            // 1. MEDIA CHECK
            const hasDbId = dbIdInput && dbIdInput.value;
            const hasNewFile = fileInput && fileInput.files.length > 0;

            if (!hasDbId && !hasNewFile) {
                validationError = true;
                
                const mediaContainer = itemDiv.querySelector('.media-container');
                highlightError(mediaContainer);

                let mediaType = 'Image';
                if (type === 'quote') mediaType = 'Video';

                swal.fire({
                    icon: 'warning',
                    title: `Missing ${mediaType}`,
                    text: `Please upload a ${mediaType} for item #${index + 1} (${type}).`,
                    confirmButtonText: 'OK',
                    showConfirmButton: true // FORCE button visibility
                });
                return;
            }
            
            // 2. TEXT CHECK
            if (type !== 'banner') {
                if (!answerVal) {
                    validationError = true;
                    highlightError(answerInput);
                    swal.fire({
                        icon: 'warning',
                        title: 'Missing Information',
                        text: `Please enter the ${type === 'quote' ? 'Correct Quote' : 'Character Name'} for item #${index + 1}.`,
                        confirmButtonText: 'OK',
                        showConfirmButton: true
                    });
                    return;
                }
            }

            // 3. TIME CHECK
            if (type === 'quote') {
                if (!timeVal) {
                    validationError = true;
                    highlightError(timeInput);
                    swal.fire({
                        icon: 'warning',
                        title: 'Missing Time',
                        text: `Please enter the Stop Time (e.g. 14.5) for Quote #${index + 1}.`,
                        confirmButtonText: 'OK',
                        showConfirmButton: true
                    });
                    return;
                }
            }

            const fileKey = `${type}_${Date.now()}_${index}`;

            const itemData = {
                dbId: dbIdInput ? dbIdInput.value : null, 
                type: type,
                fileKey: fileKey,
                answer: answerVal,
                stop_time: timeVal,
                pixel_level: pixelInput ? (pixelInput.value / 100) : 1.0 
            };

            if (fileInput && fileInput.files[0]) {
                formData.append(fileKey, fileInput.files[0]);
            }

            contentItems.push(itemData);
        });
    };

    // Process Lists
    processList('list-quotes', 'quote');
    processList('list-chars', 'character');
    processList('list-banners', 'banner');

    // If validation failed, stop here. The alert is already showing.
    if (validationError) return;

    formData.append('contentItems', JSON.stringify(contentItems));

    // --- SHOW LOADING NOW (Only after everything is valid) ---
    swal.fire({ 
        title: 'Saving Data...', 
        text: 'Please wait while we upload your files.',
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });

    // Send to Server
    try {
        const response = await fetch('/api/admin/content', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            swal.fire({
                icon: 'success',
                title: 'Saved!',
                text: 'Content has been updated successfully.',
                showConfirmButton: true,
                confirmButtonText: 'OK'
            }).then(() => {
                resetForm();
                searchContent();
            });
            
        } else {
            throw new Error(result.error || 'Unknown error');
        }
    } catch (error) {
        swal.fire({
            icon: 'error',
            title: 'Save Failed',
            text: error.message,
            showConfirmButton: true,
            confirmButtonText: 'OK'
        });
    }
}

function deleteFranchise() {
    const id = document.getElementById('editContentId').value;

    if (!id) return;

    // USE 'swal' MIXIN
    swal.fire({
        title: 'Delete this Franchise?',
        text: "This will permanently delete the franchise and files.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Yes, delete it!'
    }).then((result) => {
        if (result.isConfirmed) {
            swal.fire({ title: 'Deleting...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

            fetch(`/api/admin/franchise/${id}`, {
                method: 'DELETE'
            })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        swal.fire('Deleted!', 'Franchise has been removed.', 'success');
                        resetForm();
                        searchContent();
                    } else {
                        swal.fire('Error', data.error || 'Failed to delete.', 'error');
                    }
                })
                .catch(err => {
                    swal.fire('Error', 'Server connection error.', 'error');
                });
        }
    });
}