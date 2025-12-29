const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const sharp = require('sharp');

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

const upload = multer({ storage: storage });
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

        db.run(sql, [email, hash, nickname, avatarPath], function (err) {
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
            req.session.save((err) => {
                if (err) return res.status(500).json({ error: "Session Error" });
                res.json({ success: true });
            });
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
                db.all(`SELECT t.name FROM tags t JOIN franchise_tags ft ON ft.tag_id = t.id WHERE ft.franchise_id = ?`, [f.id], (e, r) => resolve(r ? r.map(x => x.name) : []));
            });

            const questions = await new Promise((resolve) => {
                db.all(`SELECT * FROM questions WHERE franchise_id = ?`, [f.id], (e, r) => resolve(r || []));
            });

            return {
                id: f.id,
                title: f.title,
                category: f.category,
                tags: tags,
                questions: questions
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

    const handleTags = async (franchiseId, tagString) => {
        if (!tagString) return;
        let tagList = [];
        try { tagList = JSON.parse(tagString); } catch (e) { }

        await new Promise(r => db.run(`DELETE FROM franchise_tags WHERE franchise_id = ?`, [franchiseId], r));

        for (const tagName of tagList) {
            const clean = tagName.trim();
            if (!clean) continue;
            let tagId = await new Promise(resolve => {
                db.get(`SELECT id FROM tags WHERE name = ?`, [clean], (err, row) => {
                    if (row) resolve(row.id);
                    else db.run(`INSERT INTO tags (name) VALUES (?)`, [clean], function () { resolve(this.lastID); });
                });
            });
            db.run(`INSERT INTO franchise_tags (franchise_id, tag_id) VALUES (?, ?)`, [franchiseId, tagId]);
        }
    };

    const upsertItem = (franchiseId, item) => {
        return new Promise((resolve, reject) => {
            const uploadedFile = files.find(f => f.fieldname === item.fileKey);

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

                const finalAnswer = item.answer || (row ? row.answer : '');
                const finalStop = item.stop_time || (row ? row.stop_time : null);
                const finalPixel = item.pixel_level || (row ? row.pixel_level : 1.0);

                if (row) {
                    db.run(`UPDATE questions SET media_path=?, answer=?, stop_time=?, pixel_level=? WHERE id=?`,
                        [mediaPath, finalAnswer, finalStop, finalPixel, row.id], (err) => err ? reject(err) : resolve());
                } else {
                    if (!mediaPath && !uploadedFile) return resolve();
                    db.run(`INSERT INTO questions (franchise_id, type, media_path, answer, stop_time, pixel_level) VALUES (?, ?, ?, ?, ?, ?)`,
                        [franchiseId, item.type, mediaPath, finalAnswer, finalStop, finalPixel], (err) => err ? reject(err) : resolve());
                }
            });
        });
    };

    try {
        let franchiseId = id;

        if (id) {
            await new Promise((resolve, reject) => {
                db.run(`UPDATE franchises SET title = ?, category = ? WHERE id = ?`, [title, category, id], (err) => err ? reject(err) : resolve());
            });
        } else {
            franchiseId = await new Promise((resolve, reject) => {
                db.run(`INSERT INTO franchises (title, category) VALUES (?, ?)`, [title, category], function (err) { err ? reject(err) : resolve(this.lastID); });
            });
        }

        await handleTags(franchiseId, tags);

        let existingQuestions = [];
        if (id) {
            existingQuestions = await new Promise(resolve => {
                db.all('SELECT id, media_path FROM questions WHERE franchise_id = ?', [franchiseId], (err, rows) => resolve(rows || []));
            });
        }

        let incomingIds = [];
        if (req.body.contentItems) {
            const items = JSON.parse(req.body.contentItems);
            for (const item of items) {
                await upsertItem(franchiseId, item);
                if (item.dbId) incomingIds.push(String(item.dbId));
            }
        }

        if (id) {
            for (const q of existingQuestions) {
                if (!incomingIds.includes(String(q.id))) {
                    if (q.media_path) deleteFile(q.media_path);
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

// --- ROUTE: DELETE FRANCHISE ---
app.delete('/api/admin/franchise/:id', (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied" });
    }

    const franchiseId = req.params.id;

    // 1. Get all media paths associated with this franchise to delete files
    db.all('SELECT media_path FROM questions WHERE franchise_id = ?', [franchiseId], (err, rows) => {
        if (err) console.error("Error fetching files for deletion:", err);

        // Delete physical files
        if (rows && rows.length > 0) {
            rows.forEach(row => {
                if (row.media_path) deleteFile(row.media_path);
            });
        }

        // 2. Perform Database Cleanup
        db.serialize(() => {
            // Remove Tags association
            db.run('DELETE FROM franchise_tags WHERE franchise_id = ?', [franchiseId]);

            // Remove Questions/Content
            db.run('DELETE FROM questions WHERE franchise_id = ?', [franchiseId]);

            // Remove Franchise Entry
            db.run('DELETE FROM franchises WHERE id = ?', [franchiseId], function (err) {
                if (err) {
                    res.status(500).json({ error: "Database Delete Error" });
                } else {
                    res.json({ success: true });
                }
            });
        });
    });
});

// --- ROUTES: GAME LOGIC ---
/* --- ROUTES: GAME LOGIC --- */
app.get('/api/content/random', (req, res) => {
    const category = req.query.category || 'movie';

    db.get(`SELECT * FROM franchises WHERE category = ? ORDER BY RANDOM() LIMIT 1`, [category], (err, franchise) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!franchise) return res.json(null);

        db.all(`SELECT * FROM questions WHERE franchise_id = ?`, [franchise.id], (err, questions) => {
            if (err) return res.status(500).json({ error: err.message });

            const pickRandom = (type) => {
                const arr = questions.filter(q => q.type === type);
                return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : {};
            };

            const quoteQ = pickRandom('quote');
            const charQ = pickRandom('character');
            const bannerQ = pickRandom('banner');

            const responseData = {
                id: franchise.id,
                title: franchise.title,
                category: franchise.category,

                // Specific IDs
                quote_id: quoteQ.id,
                char_id: charQ.id,
                banner_id: bannerQ.id,

                // --- FIX: SEND SPECIFIC ANSWERS FOR ALL MODES ---
                answer_quote: quoteQ.answer,
                answer_char: charQ.answer,     // <--- Added this
                answer_banner: bannerQ.answer, // <--- Added this
                // ---------------------------------------------

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
    // FIX: Receive specific questionId instead of generic franchiseId
    const { questionId, userGuess, attempts, hints, timeTaken } = req.body;

    // FIX: Look up by specific question ID
    db.get(`SELECT * FROM questions WHERE id = ?`, [questionId], (err, question) => {
        if (!question) return res.status(404).json({ error: "Question not found" });

        const cleanGuess = userGuess.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanAnswer = question.answer.toLowerCase().replace(/[^a-z0-9]/g, '');

        const isCorrect = cleanGuess === cleanAnswer;

        if (isCorrect && req.session.userId) {
            const sql = `INSERT INTO user_activity 
                         (user_id, question_id, is_solved, attempts, hints_used, time_taken) 
                         VALUES (?, ?, ?, ?, ?, ?)`;

            db.run(sql, [
                req.session.userId,
                question.id,
                1,
                attempts,
                hints,
                timeTaken || 0
            ]);

            db.run(`UPDATE users SET total_points = total_points + 100 WHERE id = ?`, [req.session.userId]);
        }

        res.json({ correct: isCorrect, correctString: isCorrect ? question.answer : null });
    });
});

/* --- IMAGE PROXY ROUTE WITH LINEAR PROGRESSION --- */
app.get('/api/image-proxy', async (req, res) => {
    const { path: imgPath, level } = req.query;

    if (!imgPath || !imgPath.startsWith('uploads/')) {
        return res.status(403).send('Access Denied');
    }

    try {
        let targetLevel = parseFloat(level);

        if (isNaN(targetLevel)) {
            const question = await new Promise((resolve, reject) => {
                db.get(`SELECT pixel_level FROM questions WHERE media_path = ?`, [imgPath], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            targetLevel = (question && question.pixel_level) ? question.pixel_level : 0.02;
        }

        const fullPath = path.join(__dirname, 'public', imgPath);

        if (targetLevel >= 0.95) {
            return res.sendFile(fullPath);
        }

        // --- FIXED HINT PROGRESSION ---
        const MAX_BLOCK_SIZE = 50;

        // Use LINEAR progression instead of Exponential/Sqrt.
        // This ensures the gap between Hint 4 (0.62) and Hint 5 (0.82) is distinct.
        // Hint 4: ~19px blocks | Hint 5: ~9px blocks
        let pixelSize = Math.floor(MAX_BLOCK_SIZE * (1.0 - targetLevel));

        pixelSize = Math.max(2, pixelSize);

        const metadata = await sharp(fullPath).metadata();
        const { width, height } = metadata;

        const reducedWidth = Math.max(1, Math.round(width / pixelSize));
        const reducedHeight = Math.max(1, Math.round(height / pixelSize));

        const buffer = await sharp(
            await sharp(fullPath)
                .resize(reducedWidth, reducedHeight, { fit: 'fill' })
                .toBuffer()
        )
        .resize(width, height, { kernel: sharp.kernel.nearest, fit: 'fill' })
        .jpeg({ quality: 90 })
        .toBuffer();

        res.set('Content-Type', 'image/jpeg');
        res.send(buffer);

    } catch (error) {
        console.error("Image Proxy Error:", error);
        res.status(404).send('Image not found');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});