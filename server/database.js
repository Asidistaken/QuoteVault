// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create/Open the database file
const dbPath = path.resolve(__dirname, 'quotevault.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database opening error: ', err);
    else console.log('Connected to SQLite database.');
});

// Serialize ensures these run in order
db.serialize(() => {
    // 1. Users Table (ADDED: avatar_url)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT,
        avatar_url TEXT,
        total_points INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,  -- 0 = User, 1 = Admin
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Content Table
    db.run(`CREATE TABLE IF NOT EXISTS content (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        category TEXT,
        difficulty INTEGER DEFAULT 1,
        video_path TEXT,
        image_char_path TEXT,
        image_banner_path TEXT,
        answer_quote TEXT,
        answer_char TEXT,
        stop_timestamp REAL
    )`);

    // 3. Tags Table
    db.run(`CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        weight REAL DEFAULT 1.0
    )`);

    // 4. Content_Tags
    db.run(`CREATE TABLE IF NOT EXISTS content_tags (
        content_id INTEGER,
        tag_id INTEGER,
        FOREIGN KEY(content_id) REFERENCES content(id),
        FOREIGN KEY(tag_id) REFERENCES tags(id)
    )`);

    // 5. User Activity
    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        content_id INTEGER,
        mode TEXT,
        is_solved INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        hints_used INTEGER DEFAULT 0,
        time_taken INTEGER DEFAULT 0,
        last_played DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(content_id) REFERENCES content(id)
    )`);
});

module.exports = db;