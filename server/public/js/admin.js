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
    const id = data.id || domId;

    const html = `
                <div class="card quote-card" id="${id}">
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
                    <input type="text" class="form-input inp-quote" placeholder="Correct Quote" value="${data.answer || ''}">
                </div>
            `;
    document.getElementById('list-quotes').insertAdjacentHTML('beforeend', html);
}

function addCharItem(data = {}) {
    const domId = uuid();
    const id = data.id || domId;
    const level = data.level !== undefined ? data.level * 100 : 100;

    const html = `
                <div class="card char-card" id="${id}">
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
    const level = data.level !== undefined ? data.level * 100 : 100;

    const html = `
                <div class="card banner-card" id="${id}">
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
    if(card) {
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
    const level = val / 100;

    if (level >= 1.0) {
        ctx.drawImage(raw, 0, 0);
    } else {
        const w = cv.width * level;
        const h = cv.height * level;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(raw, 0, 0, w, h);
        ctx.drawImage(cv, 0, 0, w, h, 0, 0, cv.width, cv.height);
    }
}

// --- 4. LOAD & RESET ---
function loadEdit(item) {
    resetForm();
    document.getElementById('editContentId').value = item.id;
    setCategory(item.category);
    document.getElementById('metaTitle').value = item.title;

    document.getElementById('list-quotes').innerHTML = '';
    document.getElementById('list-chars').innerHTML = '';
    document.getElementById('list-banners').innerHTML = '';

    // Loop through the questions array from the server
    item.questions.forEach(q => {
        if (q.type === 'quote') {
            // Pass the ID explicitly
            addQuoteItem({ id: q.id, path: q.media_path, stop: q.stop_time, answer: q.answer });
        } else if (q.type === 'character') {
            addCharItem({ id: q.id, path: q.media_path, answer: q.answer, level: q.pixel_level });
        } else if (q.type === 'banner') {
            addBannerItem({ id: q.id, path: q.media_path, level: q.pixel_level });
        }
    });

    // Add empty cards if none exist
    if (document.getElementById('list-quotes').children.length === 0) addQuoteItem();
    if (document.getElementById('list-chars').children.length === 0) addCharItem();
    if (document.getElementById('list-banners').children.length === 0) addBannerItem();

    currentTags = item.tags || [];
    renderTags();
}

function resetForm() {
    document.getElementById('editContentId').value = '';
    document.getElementById('metaTitle').value = '';
    document.getElementById('list-quotes').innerHTML = '';
    document.getElementById('list-chars').innerHTML = '';
    document.getElementById('list-banners').innerHTML = '';

    addQuoteItem();
    addCharItem();
    addBannerItem();

    currentTags = [];
    renderTags();
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

// --- 6. SAVE ---
async function saveContent() {
    const id = document.getElementById('editContentId').value;
    const title = document.getElementById('metaTitle').value;
    const fd = new FormData();

    fd.append('id', id);
    fd.append('category', currentCategory);
    fd.append('title', title);
    fd.append('tags', JSON.stringify(currentTags));

    // Collect ALL items (Quotes, Chars, Banners)
    const items = [];

    // 1. Helper to process cards
    const processCards = (selector, type) => {
        document.querySelectorAll(selector + ' .card').forEach((card, index) => {
            const dbId = card.id.startsWith('id-') ? null : card.id; // Existing ID or Null

            // Generate a unique key for the file (e.g., "video_0", "char_1")
            const fileKey = `${type}_${index}_${Math.random().toString(36).substr(2, 5)}`;

            const fileInput = card.querySelector('.file-video') || card.querySelector('.file-img');
            if (fileInput.files[0]) {
                fd.append(fileKey, fileInput.files[0]);
            }

            // Gather Data
            const answer = card.querySelector('.inp-quote') ? card.querySelector('.inp-quote').value :
                (card.querySelector('.inp-answer') ? card.querySelector('.inp-answer').value : title);

            const stopTime = card.querySelector('.inp-time') ? card.querySelector('.inp-time').value : null;
            const pixelSlider = card.querySelector('.rng-pixel');
            const pixelLevel = pixelSlider ? pixelSlider.value / 100 : null;

            items.push({
                type: type,
                dbId: dbId, // Pass the DB ID so server knows to UPDATE, not INSERT
                fileKey: fileKey, // Tell server which file belongs to this item
                answer: answer,
                stop_time: stopTime,
                pixel_level: pixelLevel
            });
        });
    };

    processCards('#list-quotes', 'quote');
    processCards('#list-chars', 'character');
    processCards('#list-banners', 'banner');

    // Send the metadata as a JSON string
    fd.append('contentItems', JSON.stringify(items));

    try {
        const res = await fetch('/api/admin/content', { method: 'POST', body: fd });
        const d = await res.json();
        if (d.success) {
            swal.fire({ icon: 'success', title: 'Saved', showConfirmButton: false, timer: 1000 });
            searchContent();
            if (!id) resetForm();
        } else throw new Error(d.error);
    } catch (e) {
        swal.fire({ icon: 'error', title: 'Error', text: e.message });
    }
}