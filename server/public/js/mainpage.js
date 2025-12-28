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