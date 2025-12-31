// Check Login Status on Load
fetch('/api/me')
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('auth-container');
        if (data.loggedIn) {
            const avatarSrc = data.user.avatar_url
                ? data.user.avatar_url
                : `https://ui-avatars.com/api/?name=${data.user.username}&background=random`;

            container.innerHTML = `
                        <div class="user-profile" onclick="logout()">
                            <img src="${avatarSrc}" class="user-avatar">
                            <span class="user-name">${data.user.username}</span>
                            <i class="fa-solid fa-sign-out-alt" style="margin-left:5px; font-size:0.8rem;"></i>
                        </div>
                    `;
        } else {
            container.innerHTML = `<a href="login.html" class="btn-signin">Sign In</a>`;
        }
    });

function logout() {
    fetch('/api/logout', { method: 'POST' }).then(() => window.location.reload());
}

// --- Layout Helpers ---
function setTheme(theme) {
    document.body.className = 'theme-' + theme;
    document.querySelectorAll('.category-sidebar .nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.onclick.toString().includes(theme));
    });
    if (window.loadCategoryContent) window.loadCategoryContent(theme);
}

function setMode(modeName) {
    // 1. Update Buttons (Safer Loop)
    document.querySelectorAll('.mode-btn').forEach(btn => {
        // Ignore the suggest button for styling
        if (btn.classList.contains('suggest-btn')) return;

        btn.classList.remove('active');

        // SAFETY CHECK: Only check onclick if it actually exists
        if (btn.onclick) {
            if (btn.onclick.toString().includes(modeName)) {
                btn.classList.add('active');
            }
        }
    });

    // 2. Switch View
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active');
    });
    const targetView = document.getElementById('view-' + modeName);
    if (targetView) targetView.classList.add('active');

    // 3. Logic Updates
    window.currentMode = modeName;

    if (window.updateInputState) {
        window.updateInputState();
    }

    // Pause video if leaving quote mode
    const video = document.getElementById('clip');
    if (modeName !== 'quote' && video && !video.paused) {
        video.pause();
        document.querySelector('.video-wrapper').classList.remove('playing');
    }
}

/* --- RECOMMENDATION MODAL LOGIC --- */
// 1. Cache Variable
window.recCache = {
    movie: [],
    series: [],
    game: []
};

function openRecModal() {
    const modal = document.getElementById('rec-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('active'), 10);

    const category = getActiveCategory();

    // Check Cache: If empty, auto-load. If exists, just show it.
    if (window.recCache[category] && window.recCache[category].length > 0) {
        renderRecList(window.recCache[category]);
    } else {
        loadRecommendations(3, false); // Initial Load (not append)
    }
}

function closeRecModal() {
    const modal = document.getElementById('rec-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => modal.classList.add('hidden'), 300);
}

// 2. Manual "Get More" Handler
function manualRefreshRecs() {
    const input = document.getElementById('rec-count-input');
    const count = input ? parseInt(input.value) : 3;
    loadRecommendations(count, true); // True = Append mode
}

function getActiveCategory() {
    const activeBtn = document.querySelector('.category-sidebar .nav-btn.active');
    if (!activeBtn) return 'movie';
    const title = activeBtn.getAttribute('title').toLowerCase();
    if (title.includes('series')) return 'series';
    if (title.includes('game')) return 'game';
    return 'movie';
}

// 3. Main Load Logic
async function loadRecommendations(count = 3, isAppend = false) {
    const list = document.getElementById('rec-list');
    const modalBody = document.querySelector('.modal-body'); // Select wrapper for scrolling
    const category = getActiveCategory();
    let currentRecs = window.recCache[category] || [];

    // UI: If appending, show loader at bottom. If fresh, clear list.
    let loadingEl = null;

    if (isAppend) {
        loadingEl = document.createElement('div');
        loadingEl.className = 'rec-loading-small';
        loadingEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Finding ${count} more...`;
        list.appendChild(loadingEl);

        // Auto-scroll to show the loader
        if (modalBody) {
            setTimeout(() => {
                modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
            }, 50);
        }
    } else {
        list.innerHTML = `
            <div class="rec-loading">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>Thinking of ${count} ideas...</p>
            </div>
        `;
    }

    try {
        // Collect existing titles to exclude
        const excludeTitles = currentRecs.map(r => r.title);
        const excludeParam = encodeURIComponent(JSON.stringify(excludeTitles));

        const res = await fetch(`/api/recommend?category=${category}&limit=${count}&exclude=${excludeParam}`);

        if (res.status === 401) {
            renderLoginError(list);
            return;
        }

        const data = await res.json();

        // Remove loader
        if (loadingEl) loadingEl.remove();

        if (data.error) {
            if (!isAppend) list.innerHTML = `<div class="rec-empty"><i class="fa-solid fa-triangle-exclamation"></i><br>${data.error}</div>`;
            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            if (!isAppend) {
                list.innerHTML = `<div class="rec-empty"><i class="fa-solid fa-gamepad"></i><p>No history found yet!</p></div>`;
            }
            return;
        }

        // 4. Update Cache (Accumulate)
        if (isAppend) {
            window.recCache[category] = [...currentRecs, ...data];
        } else {
            window.recCache[category] = data;
        }

        // 5. Render Full List
        renderRecList(window.recCache[category]);

        toggleRecFooter(true);

        // 6. Scroll to bottom again to show new items
        if (isAppend && modalBody) {
            setTimeout(() => {
                modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
            }, 100);
        }

    } catch (err) {
        console.error(err);
        if (loadingEl) loadingEl.remove();
        if (!isAppend) list.innerHTML = `<div class="rec-empty">Failed to connect to AI.</div>`;
    }
}

function renderRecList(data) {
    const list = document.getElementById('rec-list');
    list.innerHTML = ''; // Clear and rebuild to ensure order

    data.forEach((item, index) => {
        // Stagger animation based on index
        const delay = (index % 5) * 0.1;
        const html = `
            <div class="rec-item" style="animation-delay: ${delay}s">
                <div class="rec-header">
                    <span class="rec-title">${item.title}</span>
                    <span class="rec-year">${item.year || ''}</span>
                </div>
                <div class="rec-reason">"${item.reason}"</div>
            </div>
        `;
        list.insertAdjacentHTML('beforeend', html);
    });

    // Auto scroll to bottom if we just added items
    const modalBody = document.querySelector('.modal-body');
    if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
}

function renderLoginError(list) {
    toggleRecFooter(false);

    list.innerHTML = `
        <div class="rec-empty">
            <i class="fa-solid fa-lock"></i>
            <p>Login Required</p>
            <br>
            <a href="login.html" class="btn-signin" style="position:static; transform:none;">Sign In</a>
        </div>`;
}

function toggleRecFooter(show) {
    const footer = document.querySelector('.modal-footer');
    if (footer) {
        footer.style.display = show ? 'flex' : 'none';
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('rec-modal');
    if (e.target === modal) {
        closeRecModal();
    }
});