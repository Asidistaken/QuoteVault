// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Hosts your HTML/CSS/JS

// Session Config (Keeps user logged in)
app.use(session({
    secret: 'quotevault_secret_key', // Change this in production
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// File Upload Config (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/'); // Files save to QuoteVault/public/uploads/
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- ROUTES: PAGES ---

// Serve the main app
app.get('/', (req, res) => {
    // If not logged in, send to login page
    if (!req.session.userId) {
        return res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve Admin Page (Protect this in real app!)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});


// --- ROUTES: AUTH ---

// Sign Up
app.post('/api/signup', async (req, res) => {
    const { email, password } = req.body;
    // Hash the password
    const hash = await bcrypt.hash(password, 10);
    
    const sql = `INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)`;
    // Using email as username for prototype simplicity
    db.run(sql, [email, hash, email.split('@')[0]], function(err) {
        if (err) return res.status(400).json({ error: "Email likely exists" });
        
        req.session.userId = this.lastID; // Auto-login
        res.json({ success: true });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "User not found" });
        
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.userId = user.id;
            res.json({ success: true });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    });
});

// --- ROUTES: ADMIN (UPLOAD CONTENT) ---

// Handle 3 files at once: video, charImg, bannerImg
const uploadFields = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'image_char', maxCount: 1 },
    { name: 'image_banner', maxCount: 1 }
]);

app.post('/api/admin/content', uploadFields, (req, res) => {
    const { 
        title, category, difficulty, 
        answer_quote, answer_char, stop_timestamp 
    } = req.body;

    // Get file paths relative to 'public' folder
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

// Get Random Content (Basic Recommendation Stub)
app.get('/api/content/random', (req, res) => {
    const category = req.query.category || 'movie';
    
    // In future: Add complex "User Activity" join here for recommendations
    db.get(`SELECT * FROM content WHERE category = ? ORDER BY RANDOM() LIMIT 1`, [category], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// Check Answer & Log Activity
app.post('/api/check-answer', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });

    const { contentId, mode, userGuess, attempts, hints } = req.body;
    
    db.get(`SELECT * FROM content WHERE id = ?`, [contentId], (err, content) => {
        if (!content) return res.status(404).json({ error: "Content not found" });

        let isCorrect = false;
        let correctAnswer = "";

        // Fuzzy Match Logic
        const cleanGuess = userGuess.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (mode === 'quote') {
            correctAnswer = content.answer_quote;
            const cleanAnswer = correctAnswer.toLowerCase().replace(/[^a-z0-9]/g, '');
            isCorrect = cleanGuess === cleanAnswer;
        } else if (mode === 'character') {
            correctAnswer = content.answer_char;
            const cleanAnswer = correctAnswer.toLowerCase().replace(/[^a-z0-9]/g, '');
            isCorrect = cleanGuess === cleanAnswer;
        } else if (mode === 'banner') {
            correctAnswer = content.title;
            const cleanAnswer = correctAnswer.toLowerCase().replace(/[^a-z0-9]/g, '');
            isCorrect = cleanGuess === cleanAnswer;
        }

        // --- THE "SCALABLE LOGGING" ---
        // We insert/update the activity log immediately
        const logSql = `INSERT INTO user_activity (user_id, content_id, mode, is_solved, attempts, hints_used) 
                        VALUES (?, ?, ?, ?, ?, ?)`;
        
        // In a real app, you might UPDATE if the row exists, but INSERT allows 
        // you to see history of every session.
        if (isCorrect) {
            db.run(logSql, [req.session.userId, contentId, mode, 1, attempts, hints]);
            
            // Give Points (Optional: Add to users table)
            db.run(`UPDATE users SET total_points = total_points + 100 WHERE id = ?`, [req.session.userId]);
        }

        res.json({ correct: isCorrect, correctString: isCorrect ? correctAnswer : null });
    });
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`- Login: http://localhost:${PORT}/`);
    console.log(`- Admin: http://localhost:${PORT}/admin`);
});