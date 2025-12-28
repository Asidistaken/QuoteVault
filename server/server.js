// server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const Jimp = require('jimp');

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

// --- HELPER: DELETE FILE ---
const deleteFile = (relativePath) => {
    if (!relativePath) return;
    const fullPath = path.join(__dirname, 'public', relativePath);
    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (!err) {
            fs.unlink(fullPath, (err) => {
                if (err) console.error(`Failed to delete ${fullPath}:`, err);
                else console.log(`Deleted old file: ${fullPath}`);
            });
        }
    });
};

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

    try {
        const existingUser = await new Promise((resolve, reject) => {
            db.get(`SELECT email, username FROM users WHERE email = ? OR username = ?`, [email, nickname], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existingUser) {
            if (req.file) deleteFile(avatarPath); // Cleanup uploaded file if duplicate
            if (existingUser.email === email) return res.status(400).json({ error: "Email already exists" });
            if (existingUser.username === nickname) return res.status(400).json({ error: "Nickname already taken" });
        }

        const hash = await bcrypt.hash(password, 10);
        const sql = `INSERT INTO users (email, password_hash, username, avatar_url) VALUES (?, ?, ?, ?)`;
        
        db.run(sql, [email, hash, nickname, avatarPath], function(err) {
            if (err) {
                if (req.file) deleteFile(avatarPath);
                return res.status(500).json({ error: "Database error" });
            }
            req.session.userId = this.lastID;
            res.json({ success: true });
        });

    } catch (e) {
        if (req.file) deleteFile(avatarPath);
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

// --- ROUTES: ADMIN (SEARCH & TAGS) ---
app.get('/api/admin/search', (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ error: "Access Denied" });
    
    const { query, type } = req.query;
    let sql = `SELECT * FROM content WHERE title LIKE ?`;
    let params = [`%${query}%`];

    if (type && type !== 'all') {
        sql += ` AND category = ?`;
        params.push(type);
    }
    
    sql += ` ORDER BY id DESC LIMIT 20`;

    db.all(sql, params, async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const rowsWithTags = await Promise.all(rows.map(async (row) => {
            const tags = await new Promise((resolve) => {
                db.all(`
                    SELECT t.name FROM tags t
                    JOIN content_tags ct ON ct.tag_id = t.id
                    WHERE ct.content_id = ?
                `, [row.id], (err, tRows) => {
                    resolve(tRows ? tRows.map(t => t.name) : []);
                });
            });
            return { ...row, tags };
        }));

        res.json(rowsWithTags);
    });
});

app.get('/api/admin/tags', (req, res) => {
    const { q } = req.query;
    db.all(`SELECT name FROM tags WHERE name LIKE ? LIMIT 10`, [`%${q}%`], (err, rows) => {
        if (err) return res.json([]);
        res.json(rows.map(r => r.name));
    });
});

// --- ROUTES: ADMIN (UPLOAD/UPDATE CONTENT) ---
const uploadFields = upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'image_char', maxCount: 1 },
    { name: 'image_banner', maxCount: 1 }
]);

app.post('/api/admin/content', uploadFields, async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied: Admins Only" });
    }
    
    const { 
        id, title, category, difficulty, 
        answer_quote, answer_char, stop_timestamp,
        char_pixel_level, banner_pixel_level,
        tags
    } = req.body;

    const handleTags = async (contentId, tagString) => {
        if (!tagString) return;
        let tagList = [];
        try { tagList = JSON.parse(tagString); } catch(e) {}
        
        await new Promise(r => db.run(`DELETE FROM content_tags WHERE content_id = ?`, [contentId], r));

        for (const tagName of tagList) {
            const cleanTag = tagName.trim();
            if(!cleanTag) continue;

            let tagId = await new Promise((resolve) => {
                db.get(`SELECT id FROM tags WHERE name = ?`, [cleanTag], (err, row) => {
                    if(row) resolve(row.id);
                    else {
                        db.run(`INSERT INTO tags (name) VALUES (?)`, [cleanTag], function(err) {
                            resolve(this.lastID);
                        });
                    }
                });
            });
            db.run(`INSERT INTO content_tags (content_id, tag_id) VALUES (?, ?)`, [contentId, tagId]);
        }
    };

    try {
        if (id) {
            // --- UPDATE EXISTING CONTENT ---
            // 1. Fetch old data to get file paths
            db.get(`SELECT * FROM content WHERE id = ?`, [id], (err, row) => {
                if (err || !row) return res.status(404).json({ error: "Content not found" });

                let updateFields = [];
                let updateParams = [];

                updateFields.push("title = ?", "category = ?", "difficulty = ?", "answer_quote = ?", "answer_char = ?", "stop_timestamp = ?");
                updateParams.push(title, category, difficulty, answer_quote, answer_char, stop_timestamp);
                
                updateFields.push("char_pixel_level = ?", "banner_pixel_level = ?");
                updateParams.push(char_pixel_level || 1.0, banner_pixel_level || 1.0);

                // Check and replace files (DELETE OLD FILES HERE)
                if (req.files['video']) {
                    deleteFile(row.video_path); // Delete old
                    updateFields.push("video_path = ?");
                    updateParams.push('uploads/' + req.files['video'][0].filename);
                }
                if (req.files['image_char']) {
                    deleteFile(row.image_char_path); // Delete old
                    updateFields.push("image_char_path = ?");
                    updateParams.push('uploads/' + req.files['image_char'][0].filename);
                }
                if (req.files['image_banner']) {
                    deleteFile(row.image_banner_path); // Delete old
                    updateFields.push("image_banner_path = ?");
                    updateParams.push('uploads/' + req.files['image_banner'][0].filename);
                }

                updateParams.push(id);

                const sql = `UPDATE content SET ${updateFields.join(', ')} WHERE id = ?`;
                db.run(sql, updateParams, async function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    await handleTags(id, tags);
                    res.json({ success: true, id: id, message: "Content Updated" });
                });
            });

        } else {
            // --- CREATE NEW CONTENT ---
            // 1. Clean uploaded files if we fail later
            const cleanupNewFiles = () => {
                if(req.files['video']) deleteFile('uploads/' + req.files['video'][0].filename);
                if(req.files['image_char']) deleteFile('uploads/' + req.files['image_char'][0].filename);
                if(req.files['image_banner']) deleteFile('uploads/' + req.files['image_banner'][0].filename);
            };

            const videoPath = req.files['video'] ? 'uploads/' + req.files['video'][0].filename : null;
            const charPath = req.files['image_char'] ? 'uploads/' + req.files['image_char'][0].filename : null;
            const bannerPath = req.files['image_banner'] ? 'uploads/' + req.files['image_banner'][0].filename : null;

            if (!videoPath && !charPath && !bannerPath) {
                 cleanupNewFiles();
                 return res.status(400).json({ error: "At least one file is required." });
            }

            const sql = `INSERT INTO content (
                title, category, difficulty, video_path, image_char_path, image_banner_path,
                answer_quote, answer_char, stop_timestamp, char_pixel_level, banner_pixel_level
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.run(sql, [
                title, category, difficulty, videoPath, charPath, bannerPath,
                answer_quote, answer_char, stop_timestamp, 
                char_pixel_level || 1.0, 
                banner_pixel_level || 1.0
            ], async function(err) {
                if (err) {
                    cleanupNewFiles();
                    return res.status(500).json({ error: err.message });
                }
                await handleTags(this.lastID, tags);
                res.json({ success: true, id: this.lastID, message: "Content Created" });
            });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server Error" });
    }
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

app.get('/api/image-proxy', async (req, res) => {
    const { path: imgPath, level } = req.query;
    if (!imgPath || !imgPath.startsWith('uploads/')) return res.status(403).send('Access Denied');

    try {
        const fullPath = path.join(__dirname, 'public', imgPath);
        if (parseFloat(level) >= 1.0) return res.sendFile(fullPath);

        const image = await Jimp.read(fullPath);
        const pixelSize = Math.max(2, Math.floor(25 * (1 - parseFloat(level))));
        
        image
            .pixelate(pixelSize)
            .getBuffer(Jimp.MIME_JPEG, (err, buffer) => {
                if (err) throw err;
                res.set('Content-Type', Jimp.MIME_JPEG);
                res.send(buffer);
            });

    } catch (error) {
        res.status(404).send('Image not found');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});