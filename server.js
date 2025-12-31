const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const sharp = require('sharp');

const { generateRecommendations } = require('./geminiRecommend');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'quotevault_ultra_top_secret_key_no_one_knows_not_even_me_12345!!!',
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
const uploadAny = upload.any();

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

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

app.get('/api/tags', (req, res) => {
    db.all('SELECT id, name FROM tags ORDER BY name', [], (err, rows) => {
        if (err) return res.status(500).json([]);
        res.json(rows || []);
    });
});

app.get('/api/admin/tags', (req, res) => {
    const { q } = req.query;
    db.all(`SELECT name FROM tags WHERE name LIKE ? LIMIT 10`, [`%${q}%`], (err, rows) => {
        if (err) return res.json([]);
        res.json(rows.map(r => r.name));
    });
});

app.delete('/api/tags/:id', (req, res) => {
    const id = req.params.id;

    db.run('DELETE FROM tags WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.post('/api/admin/content', uploadAny, async (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied" });
    }

    const { id, title, category, tags } = req.body;
    const files = req.files || [];

    const handleTags = async (franchiseId, tagString) => {
        if (!tagString) return;
        let tagList = [];
        try {
            tagList = JSON.parse(tagString);
        } catch (e) {
            console.error('Failed to parse tags:', e);
            return;
        }

        await new Promise(r => db.run(`DELETE FROM franchise_tags WHERE franchise_id = ?`, [franchiseId], r));

        for (const tagObj of tagList) {
            const tagName = typeof tagObj === 'string' ? tagObj : tagObj.name;
            const tagWeight = typeof tagObj === 'object' ? (tagObj.weight || 50) : 50;

            const clean = tagName.trim();
            if (!clean) continue;

            const tagId = await new Promise(resolve => {
                db.get(`SELECT id FROM tags WHERE name = ?`, [clean], (err, row) => {
                    if (row) {
                        resolve(row.id);
                    } else {
                        db.run(`INSERT INTO tags (name) VALUES (?)`, [clean], function (err) {
                            if (err) {
                                console.error('Failed to insert tag:', err);
                                resolve(null);
                            } else {
                                resolve(this.lastID);
                            }
                        });
                    }
                });
            });

            if (tagId) {
                await new Promise(resolve => {
                    db.run(
                        `INSERT INTO franchise_tags (franchise_id, tag_id, weight) VALUES (?, ?, ?)`,
                        [franchiseId, tagId, tagWeight],
                        (err) => {
                            if (err) console.error('Failed to link tag:', err);
                            resolve();
                        }
                    );
                });
            }
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

app.delete('/api/admin/franchise/:id', (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied" });
    }

    const franchiseId = req.params.id;

    db.all('SELECT media_path FROM questions WHERE franchise_id = ?', [franchiseId], (err, rows) => {
        if (err) console.error("Error fetching files for deletion:", err);

        if (rows && rows.length > 0) {
            rows.forEach(row => {
                if (row.media_path) deleteFile(row.media_path);
            });
        }

        db.serialize(() => {
            db.run('DELETE FROM franchise_tags WHERE franchise_id = ?', [franchiseId]);

            db.run('DELETE FROM questions WHERE franchise_id = ?', [franchiseId]);

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

app.get('/api/admin/franchise/:id', (req, res) => {
    if (!req.session.userId || !req.session.isAdmin) {
        return res.status(403).json({ error: "Access Denied" });
    }

    const franchiseId = req.params.id;

    db.get('SELECT * FROM franchises WHERE id = ?', [franchiseId], (err, franchise) => {
        if (err || !franchise) {
            return res.status(404).json({ error: 'Franchise not found' });
        }

        const tagQuery = `
            SELECT t.name, ft.weight 
            FROM tags t
            JOIN franchise_tags ft ON t.id = ft.tag_id
            WHERE ft.franchise_id = ?
            ORDER BY t.name
        `;

        db.all(tagQuery, [franchiseId], (err, tags) => {
            if (err) {
                console.error('Error fetching tags:', err);
                tags = [];
            }

            db.all('SELECT * FROM questions WHERE franchise_id = ? ORDER BY id', [franchiseId], (err, content) => {
                if (err) {
                    console.error('Error fetching content:', err);
                    content = [];
                }

                const response = {
                    _id: franchise.id,
                    id: franchise.id,
                    title: franchise.title,
                    category: franchise.category,
                    tags: tags || [],
                    content: content || []
                };

                res.json(response);
            });
        });
    });
});

app.get('/api/content/random', async (req, res) => {
    const category = req.query.category || 'movie';
    
    const lastQuoteId = req.query.last_quote_id ? parseInt(req.query.last_quote_id) : null;
    const lastCharId = req.query.last_char_id ? parseInt(req.query.last_char_id) : null;
    const lastBannerId = req.query.last_banner_id ? parseInt(req.query.last_banner_id) : null;

    const getRandomItem = (type, excludeId = null) => {
        const runQuery = (ignoreExclusion) => {
            return new Promise((resolve, reject) => {
                let sql = `SELECT q.*, f.title as franchise_title 
                            FROM questions q 
                            JOIN franchises f ON q.franchise_id = f.id 
                            WHERE f.category = ? AND q.type = ?`;
                
                const params = [category, type];

                if (excludeId && !ignoreExclusion) {
                    sql += ` AND q.id != ?`;
                    params.push(excludeId);
                }

                if (type === 'character' || type === 'banner') {
                    sql += ` AND q.media_path IS NOT NULL AND q.media_path != ''`;
                }

                sql += ` ORDER BY RANDOM() LIMIT 1`;

                db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                });
            });
        };

        return runQuery(false).then(row => {
            if (row) return row;
            if (excludeId) {
                return runQuery(true);
            }
            return null;
        });
    };

    try {
        const [quoteQ, charQ, bannerQ] = await Promise.all([
            getRandomItem('quote', lastQuoteId),
            getRandomItem('character', lastCharId),
            getRandomItem('banner', lastBannerId)
        ]);

        if (!quoteQ && !charQ && !bannerQ) {
            return res.json(null);
        }

        const responseData = {
            category: category,
            title: quoteQ ? quoteQ.franchise_title : (charQ ? charQ.franchise_title : ""),
            
            quote_id: quoteQ ? quoteQ.id : null,
            quote_franchise_title: quoteQ ? quoteQ.franchise_title : null, 
            answer_quote: quoteQ ? quoteQ.answer : null,
            video_path: quoteQ ? quoteQ.media_path : null,
            stop_timestamp: quoteQ ? quoteQ.stop_time : null,

            char_id: charQ ? charQ.id : null,
            char_franchise_title: charQ ? charQ.franchise_title : null,
            answer_char: charQ ? (charQ.answer || charQ.franchise_title) : null,
            image_char_path: charQ ? charQ.media_path : null,
            char_pixel_level: charQ ? charQ.pixel_level : null,

            banner_id: bannerQ ? bannerQ.id : null,
            banner_franchise_title: bannerQ ? bannerQ.franchise_title : null,
            answer_banner: bannerQ ? (bannerQ.answer || bannerQ.franchise_title) : null,
            image_banner_path: bannerQ ? bannerQ.media_path : null,
            banner_pixel_level: bannerQ ? bannerQ.pixel_level : null
        };

        res.json(responseData);

    } catch (err) {
        console.error("Error fetching random content:", err);
        res.status(500).json({ error: "Server Error" });
    }
});

app.post('/api/check-answer', (req, res) => {
    const { questionId, userGuess, attempts, hints, timeTaken } = req.body;

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

app.get('/api/image-proxy', async (req, res) => {
    const { path: imgPath, level, hint } = req.query;

    if (!imgPath || !imgPath.startsWith('uploads/')) {
        return res.status(403).send('Access Denied');
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    try {
        let targetLevel;

        if (level !== undefined) {
            targetLevel = parseFloat(level);
        }

        else if (hint !== undefined) {
            const hintIdx = parseInt(hint);

            const question = await new Promise((resolve, reject) => {
                db.get(`SELECT pixel_level FROM questions WHERE media_path = ?`, [imgPath], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            const startLevel = (question && question.pixel_level !== undefined) ? question.pixel_level : 0.02;

            targetLevel = startLevel + (hintIdx * 0.15);
        } else {
            const question = await new Promise((resolve, reject) => {
                db.get(`SELECT pixel_level FROM questions WHERE media_path = ?`, [imgPath], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            targetLevel = (question && question.pixel_level !== undefined) ? question.pixel_level : 0.02;
        }

        const fullPath = path.join(__dirname, 'public', imgPath);

        if (targetLevel >= 0.95) {
            return res.sendFile(fullPath);
        }

        const originalImage = sharp(fullPath);
        const metadata = await originalImage.metadata();
        const { width, height } = metadata;

        const MAX_BLOCK_SIZE = 50;
        let pixelSize = Math.floor(MAX_BLOCK_SIZE * (1.0 - targetLevel));
        pixelSize = Math.max(2, pixelSize);

        const reducedWidth = Math.max(1, Math.round(width / pixelSize));
        const reducedHeight = Math.max(1, Math.round(height / pixelSize));

        const buffer = await sharp(
            await originalImage
                .resize(reducedWidth, reducedHeight, { fit: 'fill', kernel: sharp.kernel.nearest })
                .toFormat('png')
                .toBuffer()
        )
            .resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest })
            .toFormat('png')
            .toBuffer();

        res.set('Content-Type', 'image/png');
        res.send(buffer);

    } catch (error) {
        console.error("Image Proxy Error:", error);
        res.status(404).send('Image not found');
    }
});

app.get('/api/recommend', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = req.session.userId;
    const category = req.query.category || 'movie';
    const limit = parseInt(req.query.limit) || 3;

    let excludeList = [];
    if (req.query.exclude) {
        try {
            excludeList = JSON.parse(req.query.exclude);
        } catch (e) {
            console.error("Failed to parse exclude list", e);
        }
    }

    const sql = `
        SELECT f.title, f.category, q.type, ua.is_solved, ua.hints_used, ua.attempts 
        FROM user_activity ua
        JOIN questions q ON ua.question_id = q.id
        JOIN franchises f ON q.franchise_id = f.id
        WHERE ua.user_id = ? AND f.category = ?
        ORDER BY ua.last_played DESC LIMIT 20
    `;

    db.all(sql, [userId, category], async (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (!rows || rows.length === 0) return res.json([]);

        const historyText = rows.map(h => {
            const status = h.is_solved ? "WON" : "LOST";
            return `- Played "${h.title}" (${h.category}) in [${h.type}] mode. Status: ${status} (Hints: ${h.hints_used}).`;
        }).join("\n");

        //console.log(`[AI] Generating ${limit} recs for User ${userId}...`);

        const recommendations = await generateRecommendations(historyText, category, limit, excludeList);

        res.json(recommendations);
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});