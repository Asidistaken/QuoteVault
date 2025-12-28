// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Added for file cleanup
const db = require('./database');

const app = express();
const PORT = 3000;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 

app.use(session({
    secret: 'quotevault_secret_key', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- ROUTES: PAGES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.redirect('/'); 
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- ROUTES: AUTH ---

app.get('/api/me', (req, res) => {
    if (req.session.userId) {
        db.get(`SELECT username, email, total_points, avatar_url FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
            if (row) res.json({ loggedIn: true, user: row });
            else res.json({ loggedIn: false });
        });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/signup', upload.single('avatar'), async (req, res) => {
    const { email, password, nickname } = req.body;
    const avatarPath = req.file ? 'uploads/' + req.file.filename : null;

    // Helper to cleanup file if anything fails
    const cleanupFile = () => {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error("Failed to delete temp file:", err);
            });
        }
    };

    try {
        // 1. Check for duplicates specifically
        const existingUser = await new Promise((resolve, reject) => {
            db.get(`SELECT email, username FROM users WHERE email = ? OR username = ?`, [email, nickname], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingUser) {
            cleanupFile(); // Delete the uploaded PFP
            if (existingUser.email === email) {
                return res.status(400).json({ error: "Email already exists" });
            }
            if (existingUser.username === nickname) {
                return res.status(400).json({ error: "Nickname already taken" });
            }
        }

        // 2. Hash Password
        const hash = await bcrypt.hash(password, 10);
        
        // 3. Insert User
        const sql = `INSERT INTO users (email, password_hash, username, avatar_url) VALUES (?, ?, ?, ?)`;
        
        db.run(sql, [email, hash, nickname, avatarPath], function(err) {
            if (err) {
                cleanupFile(); // Delete PFP if DB error
                console.error(err);
                return res.status(500).json({ error: "Database error" });
            }
            
            req.session.userId = this.lastID; // Auto-login
            res.json({ success: true });
        });

    } catch (e) {
        cleanupFile(); // Delete PFP if Server error
        res.status(500).json({ error: "Server error" });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "User not found" });
        
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user.id;
            req.session.isAdmin = user.is_admin; 
            res.json({ success: true });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// --- ROUTES: ADMIN (UPLOAD CONTENT) ---
const uploadFields = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'image_char', maxCount: 1 },
    { name: 'image_banner', maxCount: 1 }
]);

app.post('/api/admin/content', uploadFields, (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied: Admins Only" });
    }
    
    const { 
        title, category, difficulty, 
        answer_quote, answer_char, stop_timestamp 
    } = req.body;

    const videoPath = req.files['video'] ? 'uploads/' + req.files['video'][0].filename : null;
    const charPath = req.files['image_char'] ? 'uploads/' + req.files['image_char'][0].filename : null;
    const bannerPath = req.files['image_banner'] ? 'uploads/' + req.files['image_banner'][0].filename : null;

    const sql = `INSERT INTO content (
        title, category, difficulty, video_path, image_char_path, image_banner_path,
        answer_quote, answer_char, stop_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [
        title, category, difficulty, videoPath, charPath, bannerPath,
        answer_quote, answer_char, stop_timestamp
    ], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// --- ROUTES: GAME LOGIC ---
app.get('/api/content/random', (req, res) => {
    const category = req.query.category || 'movie';
    db.get(`SELECT * FROM content WHERE category = ? ORDER BY RANDOM() LIMIT 1`, [category], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.post('/api/check-answer', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const { contentId, mode, userGuess, attempts, hints } = req.body;
    
    db.get(`SELECT * FROM content WHERE id = ?`, [contentId], (err, content) => {
        if (!content) return res.status(404).json({ error: "Content not found" });

        let isCorrect = false;
        let correctAnswer = "";

        const cleanGuess = userGuess.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (mode === 'quote') correctAnswer = content.answer_quote;
        else if (mode === 'character') correctAnswer = content.answer_char;
        else if (mode === 'banner') correctAnswer = content.title;

        const cleanAnswer = correctAnswer.toLowerCase().replace(/[^a-z0-9]/g, '');
        isCorrect = cleanGuess === cleanAnswer;

        if (isCorrect) {
            db.run(`INSERT INTO user_activity (user_id, content_id, mode, is_solved, attempts, hints_used) VALUES (?, ?, ?, ?, ?, ?)`, 
                [req.session.userId, contentId, mode, 1, attempts, hints]);
            db.run(`UPDATE users SET total_points = total_points + 100 WHERE id = ?`, [req.session.userId]);
        }

        res.json({ correct: isCorrect, correctString: isCorrect ? correctAnswer : null });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});