/* ==================== GLOBAL VARIABLES ==================== */
// CONFIG FOR SWEETALERT
const swal = Swal.mixin({
    heightAuto: false,
    scrollbarPadding: false,
    background: '#222',
    color: '#fff',
    confirmButtonColor: '#ff2e63'
});

let allAvailableTags = []; // Cached list from DB
let currentTags = [];      // Selected tags for current franchise

// UI References (Initialized in onload)
let tagInput = null;
let suggestBox = null;

let currentCategory = 'movie';
let currentFilter = 'all';

/* ==================== INITIALIZATION ==================== */
window.onload = () => {
    // 1. Initialize UI References (Safe because DOM is ready now)
    tagInput = document.getElementById('tagSearchInput');
    suggestBox = document.getElementById('tagSuggestions');

    // 2. Attach Tag Search Listeners
    if (tagInput) {
        // Typing Listener
        tagInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (val.length < 1) {
                showAllTags(); // Show all if cleared
                return;
            }
            // Filter
            const matches = allAvailableTags.filter(t => 
                t.name.toLowerCase().includes(val) && 
                !currentTags.some(sel => sel.name === t.name)
            );
            renderSuggestions(matches);
        });

        // Enter Key Listener
        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNewTagFromInput();
            }
        });
    }

    // 3. Global Click Listener (Close dropdown)
    document.addEventListener('click', (e) => {
        if (suggestBox && !e.target.closest('.tag-search-wrapper')) {
            suggestBox.classList.add('hidden');
        }
    });

    // 4. Initial Data Load
    searchContent();
    loadTagSuggestions();
    
    // 5. Initialize Default Cards
    addQuoteItem();
    addCharItem();
    addBannerItem();
};

/* ==================== TAG MANAGEMENT ==================== */

// 1. LOAD TAG SUGGESTIONS FROM SERVER
async function loadTagSuggestions() {
    try {
        const res = await fetch('/api/tags');
        if (res.ok) {
            allAvailableTags = await res.json();
            console.log('Loaded tags:', allAvailableTags);
        }
    } catch (err) {
        console.error("Failed to load tags", err);
    }
}

// 2. SEARCH & SUGGEST TAGS
function showAllTags() {
    // Ensure we filter out tags that are ALREADY added to this movie
    const available = allAvailableTags.filter(t => 
        !currentTags.some(sel => sel.name === t.name)
    );
    renderSuggestions(available);
}

function renderSuggestions(matches) {
    if (!suggestBox) return; // Safety check

    suggestBox.innerHTML = '';
    
    // CASE 1: No matches -> Suggest Creating New
    if (matches.length === 0) {
        const val = tagInput ? tagInput.value.trim() : '';
        if (val) {
            suggestBox.innerHTML = `
                <div class="suggestion-item" onclick="addNewTagFromInput()" style="color:var(--primary);">
                    <i class="fa-solid fa-plus"></i> Create "<strong>${val}</strong>"
                </div>`;
            suggestBox.classList.remove('hidden');
        } else {
            suggestBox.classList.add('hidden');
        }
        return;
    }

    // CASE 2: List matches
    matches.forEach(tag => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `<span>${tag.name}</span>`;
        div.onclick = () => {
            addTagToSelection(tag.name, 50); // Default weight 50
            if(tagInput) tagInput.value = '';
            suggestBox.classList.add('hidden');
        };
        suggestBox.appendChild(div);
    });
    suggestBox.classList.remove('hidden');
}

function addNewTagFromInput() {
    if (!tagInput) return;
    const val = tagInput.value.trim();
    if (!val) return;
    
    // Check duplicates in current selection
    if (currentTags.some(t => t.name.toLowerCase() === val.toLowerCase())) {
        swal.fire('Duplicate', 'Tag already added', 'warning');
        return;
    }

    addTagToSelection(val, 50);
    tagInput.value = '';
    if(suggestBox) suggestBox.classList.add('hidden');
}

// 4. ADD TAG TO SELECTION
function addTagToSelection(name, weight) {
    currentTags.push({ name: name, weight: weight });
    renderTagList();
}

// 5. REMOVE TAG
function removeTag(index) {
    currentTags.splice(index, 1);
    renderTagList();
}

// 6. UPDATE TAG WEIGHT
function updateTagWeight(index, newWeight) {
    const weight = parseInt(newWeight) || 0;
    // Clamp between 1-100
    currentTags[index].weight = Math.max(1, Math.min(100, weight));
    renderTagList(); // Re-render to show clamped value
}

// 7. RENDER TAG LIST
function renderTagList() {
    const list = document.getElementById('selectedTagsList');
    if (!list) return;
    list.innerHTML = '';

    currentTags.forEach((tag, index) => {
        const row = document.createElement('div');
        row.className = 'tag-row';
        row.innerHTML = `
            <button class="btn-remove-tag" onclick="removeTag(${index})" title="Remove from this content">
                <i class="fa-solid fa-xmark"></i> 
            </button>
            
            <span class="tag-name">${tag.name}</span>
            
            <input type="number" class="tag-weight-input" value="${tag.weight}" 
                   min="1" max="100" 
                   onchange="updateTagWeight(${index}, this.value)">
        `;
        list.appendChild(row);
    });
}

/* --- 2. TAG MANAGER LOGIC --- */

function openTagManager() {
    const modal = document.getElementById('tagManagerModal');
    if(modal) {
        // 1. Unhide (display: flex)
        modal.classList.remove('hidden');
        
        // 2. Trigger Animation (opacity: 1)
        // Small delay ensures the browser processes 'display: flex' before fading in
        setTimeout(() => {
            modal.classList.add('active');
        }, 10);
        
        loadManagerList();
    }
}

function closeTagManager() {
    const modal = document.getElementById('tagManagerModal');
    if(!modal) return;

    // 1. Fade Out
    modal.classList.remove('active');

    // 2. Hide after animation (0.3s matches css transition)
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function loadManagerList() {
    const list = document.getElementById('managerList');
    list.innerHTML = '<div style="color:#666; text-align:center; padding:10px;">Loading...</div>';
    
    fetch('/api/tags')
        .then(res => res.json())
        .then(tags => {
            allAvailableTags = tags; // Refresh global cache
            filterManagerList();     // Render list
        });
}

function clearManagerSearch() {
    const input = document.getElementById('managerSearch');
    input.value = '';
    input.focus();
    filterManagerList();
}

function filterManagerList() {
    const input = document.getElementById('managerSearch');
    const query = input ? input.value.toLowerCase() : '';
    const list = document.getElementById('managerList');
    list.innerHTML = '';

    const matches = allAvailableTags.filter(t => t.name.toLowerCase().includes(query));

    if (matches.length === 0) {
        list.innerHTML = '<div style="padding:10px; color:#666; text-align:center;">No tags found.</div>';
        return;
    }

    matches.forEach(tag => {
        const div = document.createElement('div');
        div.className = 'manager-item';
        div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#222; padding:10px; border-radius:6px; margin-bottom:5px;';
        div.innerHTML = `
            <span style="color:#ccc;">${tag.name}</span>
            <button onclick="deleteTagGlobal(${tag.id}, '${tag.name}')" style="background:#3a1d1d; color:#ff2e63; border:1px solid #ff2e63; padding:5px 10px; border-radius:4px; cursor:pointer;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        list.appendChild(div);
    });
}

/* --- 3. DOUBLE CONFIRMATION DELETE --- */
function deleteTagGlobal(id, name) {
    // ALERT 1: First Warning
    swal.fire({
        title: `Delete '${name}'?`,
        text: "This tag will be permanently deleted from the database.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, proceed'
    }).then((result) => {
        if (result.isConfirmed) {
            
            // ALERT 2: Second Warning (Critical)
            swal.fire({
                title: 'Are you absolutely sure?',
                text: `This will remove '${name}' from ALL movies, series, and games that use it. This cannot be undone.`,
                icon: 'error',
                background: '#111', // Dark background for emphasis
                color: '#fff',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'I understand, DELETE IT'
            }).then((finalResult) => {
                if (finalResult.isConfirmed) {
                    performGlobalDelete(id);
                }
            });
        }
    });
}

function performGlobalDelete(id) {
    swal.fire({ title: 'Deleting...', didOpen: () => Swal.showLoading() });
    
    fetch(`/api/tags/${id}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                swal.fire('Deleted', 'Tag removed from database.', 'success');
                
                // 1. Refresh Manager List
                loadManagerList(); 
                
                // 2. Check if this tag was selected in the current form and remove it
                // We need to find the name first since currentTags stores names
                const deletedTag = allAvailableTags.find(t => t.id === id);
                if (deletedTag) {
                    const idx = currentTags.findIndex(t => t.name === deletedTag.name);
                    if (idx !== -1) {
                        currentTags.splice(idx, 1);
                        renderTagList();
                    }
                }

                // 3. Refresh Global Autocomplete Cache
                loadTagSuggestions(); 

            } else {
                swal.fire('Error', 'Failed to delete tag.', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            swal.fire('Error', 'Network error.', 'error');
        });
}

// Helper to escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ==================== CONTENT MANAGEMENT ==================== */

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
        // Fetch full franchise data when clicked (to get tags with weights)
        div.onclick = async () => {
            const franchiseId = item.id || item._id;
            if (franchiseId) {
                try {
                    const response = await fetch(`/api/admin/franchise/${franchiseId}`);
                    const fullData = await response.json();
                    loadEdit(fullData);
                } catch (err) {
                    console.error('Failed to load franchise:', err);
                    // Fallback to original data
                    loadEdit(item);
                }
            } else {
                loadEdit(item);
            }
        };
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
    
    // Use media_path from database
    const mediaPath = data.media_path || data.path || '';
    const stopTime = data.stop_time || data.stop || '';

    const html = `
        <div class="card quote-card" id="${id}">
            <input type="hidden" class="inp-db-id" value="${dbId}"> 

            <div class="media-container">
                <button class="btn-remove" onclick="confirmRemoveCard('${id}')" title="Remove">
                    <i class="fa-solid fa-trash"></i>
                </button>

                <div class="placeholder-text video-ph" style="${mediaPath ? 'display:none' : ''}">
                    <i class="fa-solid fa-film"></i> No Video
                </div>
                <video class="vid-preview" controls src="${mediaPath}" style="${mediaPath ? 'display:block' : 'display:none'}"></video>
                
                <button class="btn-upload" onclick="triggerUpload('${id}', '.file-video')">
                    <i class="fa-solid fa-upload"></i>
                </button>
            </div>
            <input type="file" class="file-video" accept="video/*" hidden onchange="handleListVideo(this, '${id}')">
            <input type="text" class="form-input inp-time" placeholder="Stop Time (e.g. 14.5)" value="${stopTime}">
            <input type="text" class="form-input inp-quote inp-answer" placeholder="Correct Quote" value="${data.answer || ''}">
            </div>
    `;
    document.getElementById('list-quotes').insertAdjacentHTML('beforeend', html);
}

function addCharItem(data = {}) {
    const domId = uuid();
    const id = data.id || domId;
    const dbId = data.id || ''; 
    
    // Use pixel_level from database (already 0-1, multiply by 100 for display)
    const pixelLevel = data.pixel_level !== undefined ? data.pixel_level : 1.0;
    const level = pixelLevel * 100;
    
    // Use media_path from database
    const mediaPath = data.media_path || data.path || '';

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
    if (mediaPath) loadListImage(id, mediaPath, pixelLevel);
}

function addBannerItem(data = {}) {
    const domId = uuid();
    const id = data.id || domId;
    const dbId = data.id || ''; 
    
    // Use pixel_level from database (already 0-1, multiply by 100 for display)
    const pixelLevel = data.pixel_level !== undefined ? data.pixel_level : 1.0;
    const level = pixelLevel * 100;
    
    // Use media_path from database
    const mediaPath = data.media_path || data.path || '';

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
    if (mediaPath) loadListImage(id, mediaPath, pixelLevel);
}

// --- 3. UPLOAD TRIGGER ---
function triggerUpload(cardId, selector) {
    const card = document.getElementById(cardId);
    const input = card.querySelector(selector);
    if (input) input.click();
}

// --- 4. LIST VIDEO HANDLER ---
function handleListVideo(input, cardId) {
    const card = document.getElementById(cardId);
    const video = card.querySelector('.vid-preview');
    const ph = card.querySelector('.video-ph');
    const file = input.files[0];

    if (file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        video.style.display = 'block';
        ph.style.display = 'none';
    }
}

// --- 5. LIST IMAGE HANDLER ---
function handleListImage(input, cardId) {
    const file = input.files[0];
    if (!file) return;

    const card = document.getElementById(cardId);
    const ph = card.querySelector('.img-ph');
    const rawImg = card.querySelector('.raw-preview');
    const canvas = card.querySelector('.cv-preview');
    const pixelInput = card.querySelector('.rng-pixel');

    const level = pixelInput ? (pixelInput.value / 100) : 1.0;

    const img = new Image();
    img.onload = function () {
        rawImg.src = img.src;
        rawImg.style.display = 'none';

        applyPixel(img, canvas, level);
        canvas.style.display = 'block';
        ph.style.display = 'none';
    };
    img.src = URL.createObjectURL(file);
}

// --- 6. LOAD LIST IMAGE FROM EXISTING PATH ---
function loadListImage(cardId, path, level) {
    const card = document.getElementById(cardId);
    const ph = card.querySelector('.img-ph');
    const rawImg = card.querySelector('.raw-preview');
    const canvas = card.querySelector('.cv-preview');

    const img = new Image();
    img.onload = function () {
        rawImg.src = img.src;
        rawImg.style.display = 'none';

        applyPixel(img, canvas, level || 1.0);
        canvas.style.display = 'block';
        ph.style.display = 'none';
    };
    img.src = path;
}

// --- 7. PIXEL SYNC (RANGE <-> NUMBER) ---
function syncListPixel(cardId, val) {
    const card = document.getElementById(cardId);
    const range = card.querySelector('.rng-pixel');
    const number = card.querySelector('.num-pixel');

    if (range) range.value = val;
    if (number) number.value = val;

    // Re-apply Pixelation
    const rawImg = card.querySelector('.raw-preview');
    const canvas = card.querySelector('.cv-preview');
    if (rawImg && rawImg.src && canvas) {
        applyPixel(rawImg, canvas, val / 100);
    }
}

// --- 8. APPLY PIXEL ---
function applyPixel(img, canvas, level) {
    const ctx = canvas.getContext('2d');
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const scale = Math.max(0.01, level);
    const smallW = Math.floor(w * scale);
    const smallH = Math.floor(h * scale);

    canvas.width = w;
    canvas.height = h;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, smallW, smallH);
    ctx.drawImage(canvas, 0, 0, smallW, smallH, 0, 0, w, h);
}

// --- 9. LOAD EDIT FROM LIST ---
function loadEdit(item) {
    // Scroll to main stage (no 'editor' element exists)
    const mainStage = document.querySelector('.main-stage');
    if (mainStage) {
        mainStage.scrollIntoView({ behavior: 'smooth' });
    }

    // Use correct element IDs from HTML
    const editContentId = document.getElementById('editContentId');
    const metaTitle = document.getElementById('metaTitle'); // Correct ID
    
    if (editContentId) editContentId.value = item._id || item.id || '';
    if (metaTitle) metaTitle.value = item.title || '';

    // Set Category
    setCategory(item.category);

    // Clear Existing Lists
    const listQuotes = document.getElementById('list-quotes');
    const listChars = document.getElementById('list-chars');
    const listBanners = document.getElementById('list-banners');
    
    if (listQuotes) listQuotes.innerHTML = '';
    if (listChars) listChars.innerHTML = '';
    if (listBanners) listBanners.innerHTML = '';

    // Populate Tags (NEW STRUCTURE)
    currentTags = item.tags || [];
    renderTagList();

    // Populate Content
    if (item.content && item.content.length > 0) {
        item.content.forEach(c => {
            if (c.type === 'quote') addQuoteItem(c);
            if (c.type === 'character') addCharItem(c);
            if (c.type === 'banner') addBannerItem(c);
        });
    }

    // Show delete button when editing existing content
    const btnDelete = document.getElementById('btnDelete');
    if (btnDelete && (item._id || item.id)) {
        btnDelete.style.display = 'block';
    }
}

// --- 10. RESET FORM ---
function resetForm() {
    const editContentId = document.getElementById('editContentId');
    const metaTitle = document.getElementById('metaTitle'); // Correct ID
    
    if (editContentId) editContentId.value = '';
    if (metaTitle) metaTitle.value = '';

    const listQuotes = document.getElementById('list-quotes');
    const listChars = document.getElementById('list-chars');
    const listBanners = document.getElementById('list-banners');
    
    if (listQuotes) listQuotes.innerHTML = '';
    if (listChars) listChars.innerHTML = '';
    if (listBanners) listBanners.innerHTML = '';

    currentTags = [];
    renderTagList();

    if (tagInput) tagInput.value = '';
    if (suggestBox) suggestBox.classList.add('hidden');

    // Hide delete button when creating new
    const btnDelete = document.getElementById('btnDelete');
    if (btnDelete) btnDelete.style.display = 'none';

    setCategory('movie');
    addQuoteItem();
    addCharItem();
    addBannerItem();
}

// --- 11. SAVE CONTENT ---
function highlightError(element) {
    if (!element) return;
    element.classList.add('error-highlight');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => element.classList.remove('error-highlight'), 3000);
}

async function saveContent() {
    const metaTitle = document.getElementById('metaTitle'); // Correct ID
    const titleVal = metaTitle ? metaTitle.value.trim() : '';

    if (!titleVal) {
        swal.fire({
            icon: 'warning',
            title: 'Missing Title',
            text: 'Please enter a title for this content.',
            confirmButtonText: 'OK',
            showConfirmButton: true
        });
        if (metaTitle) metaTitle.focus();
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

    // Tags (NEW STRUCTURE: Array of {name, weight})
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