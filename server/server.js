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

// --- MULTER STORAGE ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// FIX 1: Define upload before using it
const upload = multer({ storage: storage });
// FIX 2: Create the middleware to accept ANY files (for multi-clip support)
const uploadAny = upload.any();

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
            if (req.file) deleteFile(avatarPath); 
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
    let sql = `SELECT * FROM franchises WHERE title LIKE ?`;
    let params = [`%${query}%`];

    if (type && type !== 'all') {
        sql += ` AND category = ?`;
        params.push(type);
    }
    
    sql += ` ORDER BY id DESC LIMIT 20`;

    db.all(sql, params, async (err, franchiseRows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const fullContent = await Promise.all(franchiseRows.map(async (f) => {
            const tags = await new Promise((resolve) => {
                db.all(`SELECT t.name FROM tags t JOIN franchise_tags ft ON ft.tag_id = t.id WHERE ft.franchise_id = ?`, [f.id], (e, r) => resolve(r ? r.map(x=>x.name) : []));
            });

            // FIX: Return raw questions array so frontend gets IDs
            const questions = await new Promise((resolve) => {
                db.all(`SELECT * FROM questions WHERE franchise_id = ?`, [f.id], (e, r) => resolve(r || []));
            });

            return {
                id: f.id,
                title: f.title,
                category: f.category,
                tags: tags,
                questions: questions // Returning the list lets the frontend load multiple clips
            };
        }));

        res.json(fullContent);
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
app.post('/api/admin/content', uploadAny, async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied" });
    }

    const { id, title, category, tags } = req.body;
    const files = req.files || [];

    // Helper: Manage Tags
    const handleTags = async (franchiseId, tagString) => {
        if (!tagString) return;
        let tagList = [];
        try { tagList = JSON.parse(tagString); } catch(e) {}
        
        await new Promise(r => db.run(`DELETE FROM franchise_tags WHERE franchise_id = ?`, [franchiseId], r));
        
        for (const tagName of tagList) {
            const clean = tagName.trim();
            if(!clean) continue;
            let tagId = await new Promise(resolve => {
                db.get(`SELECT id FROM tags WHERE name = ?`, [clean], (err, row) => {
                    if(row) resolve(row.id);
                    else db.run(`INSERT INTO tags (name) VALUES (?)`, [clean], function(){ resolve(this.lastID); });
                });
            });
            db.run(`INSERT INTO franchise_tags (franchise_id, tag_id) VALUES (?, ?)`, [franchiseId, tagId]);
        }
    };

    // Helper: Upsert Single Item
    const upsertItem = (franchiseId, item) => {
        return new Promise((resolve, reject) => {
            const uploadedFile = files.find(f => f.fieldname === item.fileKey);
            
            // FIX: Separate Logic for Check to prevent SQLITE_RANGE error
            let checkSql, checkParams;
            if (item.dbId) {
                checkSql = `SELECT * FROM questions WHERE id = ?`;
                checkParams = [item.dbId];
            } else {
                checkSql = `SELECT 1 WHERE 0`;
                checkParams = [];
            }
            
            db.get(checkSql, checkParams, (err, row) => {
                if (err) return reject(err);

                let mediaPath = row ? row.media_path : null;

                if (uploadedFile) {
                    if (row && row.media_path) deleteFile(row.media_path);
                    mediaPath = 'uploads/' + uploadedFile.filename;
                }

                // If user didn't type an answer, keep the old one (if exists)
                const finalAnswer = item.answer || (row ? row.answer : '');
                const finalStop = item.stop_time || (row ? row.stop_time : null);
                const finalPixel = item.pixel_level || (row ? row.pixel_level : 1.0);

                if (row) {
                    // Update existing
                    db.run(`UPDATE questions SET media_path=?, answer=?, stop_time=?, pixel_level=? WHERE id=?`, 
                        [mediaPath, finalAnswer, finalStop, finalPixel, row.id], (err) => err ? reject(err) : resolve());
                } else {
                    // Insert new (only if there is media or file)
                    if (!mediaPath && !uploadedFile) return resolve();
                    db.run(`INSERT INTO questions (franchise_id, type, media_path, answer, stop_time, pixel_level) VALUES (?, ?, ?, ?, ?, ?)`,
                        [franchiseId, item.type, mediaPath, finalAnswer, finalStop, finalPixel], (err) => err ? reject(err) : resolve());
                }
            });
        });
    };

    try {
        let franchiseId = id;

        // 1. Create or Update Franchise Title/Category
        if (id) {
            await new Promise((resolve, reject) => {
                db.run(`UPDATE franchises SET title = ?, category = ? WHERE id = ?`, [title, category, id], (err) => err ? reject(err) : resolve());
            });
        } else {
            franchiseId = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO franchises (title, category) VALUES (?, ?)`, [title, category], function(err){ err ? reject(err) : resolve(this.lastID); });
            });
        }

        // 2. Process Tags
        await handleTags(franchiseId, tags);

        // 3. Process All Content Items (Upsert: Update or Insert)
        let incomingIds = []; // Keep track of IDs we just saved

        if (req.body.contentItems) {
            const items = JSON.parse(req.body.contentItems);
            for (const item of items) {
                await upsertItem(franchiseId, item);
                // If it was an existing item (has an ID), add it to our "Keep List"
                if (item.dbId) incomingIds.push(String(item.dbId));
            }
        }

        // 4. CLEANUP: Delete items that exist in DB but were REMOVED from the screen
        if (id) { // Only run this if we are editing an existing franchise
            const existingQuestions = await new Promise(resolve => {
                db.all('SELECT id, media_path FROM questions WHERE franchise_id = ?', [franchiseId], (err, rows) => resolve(rows || []));
            });

            // Compare DB items vs. Incoming items
            for (const q of existingQuestions) {
                // If the DB ID is NOT in the list of IDs we just saved...
                if (!incomingIds.includes(String(q.id))) {
                    console.log(`[Cleanup] Deleting removed question ID: ${q.id}`);
                    
                    // 1. Delete the actual file from the folder
                    if (q.media_path) deleteFile(q.media_path);

                    // 2. Delete the row from the database
                    await new Promise(resolve => db.run('DELETE FROM questions WHERE id = ?', [q.id], resolve));
                }
            }
        }

        res.json({ success: true, message: "Saved Successfully" });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// --- ROUTES: GAME LOGIC ---
app.get('/api/content/random', (req, res) => {
    const category = req.query.category || 'movie';
    
    // 1. Pick a Random Franchise
    db.get(`SELECT * FROM franchises WHERE category = ? ORDER BY RANDOM() LIMIT 1`, [category], (err, franchise) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!franchise) return res.json(null);

        // 2. Fetch associated questions
        db.all(`SELECT * FROM questions WHERE franchise_id = ?`, [franchise.id], (err, questions) => {
            if (err) return res.status(500).json({ error: err.message });

            // FIX: Pick a random item if there are multiple clips
            const pickRandom = (type) => {
                const arr = questions.filter(q => q.type === type);
                return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : {};
            };

            const quoteQ = pickRandom('quote');
            const charQ = pickRandom('character');
            const bannerQ = pickRandom('banner');

            // 3. Bundle for Frontend
            const responseData = {
                id: franchise.id, 
                title: franchise.title,
                category: franchise.category,
                video_path: quoteQ.media_path,
                stop_timestamp: quoteQ.stop_time,
                image_char_path: charQ.media_path,
                char_pixel_level: charQ.pixel_level,
                image_banner_path: bannerQ.media_path,
                banner_pixel_level: bannerQ.pixel_level
            };

            res.json(responseData);
        });
    });
});

app.post('/api/check-answer', (req, res) => {
    // 1. We now receive 'timeTaken' from the frontend
    const { contentId, mode, userGuess, attempts, hints, timeTaken } = req.body;
    
    db.get(`SELECT * FROM questions WHERE franchise_id = ? AND type = ?`, [contentId, mode], (err, question) => {
        if (!question) return res.status(404).json({ error: "Question not found" });

        const cleanGuess = userGuess.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanAnswer = question.answer.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        const isCorrect = cleanGuess === cleanAnswer;

        // Save activity only if user is logged in
        if (isCorrect && req.session.userId) {
            // 2. Updated SQL to include 'time_taken' column
            const sql = `INSERT INTO user_activity 
                         (user_id, question_id, is_solved, attempts, hints_used, time_taken) 
                         VALUES (?, ?, ?, ?, ?, ?)`;
            
            db.run(sql, [
                req.session.userId, 
                question.id, 
                1, 
                attempts, 
                hints, 
                timeTaken || 0 // Default to 0 if missing
            ]);

            db.run(`UPDATE users SET total_points = total_points + 100 WHERE id = ?`, [req.session.userId]);
        }

        res.json({ correct: isCorrect, correctString: isCorrect ? question.answer : null });
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