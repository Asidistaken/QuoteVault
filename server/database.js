// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'quotevault.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database opening error: ', err);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    // 1. Users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT,
        avatar_url TEXT,
        total_points INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. Franchises (Parent Table)
    // Represents the "Show", "Movie", or "Game" entity
    db.run(`CREATE TABLE IF NOT EXISTS franchises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        category TEXT, -- 'movie', 'series', 'game'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 3. Questions (Child Table)
    // Represents a specific gameplay item linked to a franchise
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        franchise_id INTEGER,
        type TEXT, -- 'quote', 'character', 'banner'
        media_path TEXT, -- The video or image file
        answer TEXT, -- The correct answer string
        difficulty INTEGER DEFAULT 1,
        stop_time REAL, -- Only used for video/quote type
        pixel_level REAL DEFAULT 1.0, -- Only used for character/banner type
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(franchise_id) REFERENCES franchises(id) ON DELETE CASCADE
    )`);

    // 4. Tags
    db.run(`CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        weight REAL DEFAULT 1.0
    )`);

    // 5. Franchise_Tags (Replaces Question_Tags)
    // Links tags to the Franchise entity relationally
    db.run(`CREATE TABLE IF NOT EXISTS franchise_tags (
        franchise_id INTEGER,
        tag_id INTEGER,
        FOREIGN KEY(franchise_id) REFERENCES franchises(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`);

    // 6. User Activity
    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        question_id INTEGER,
        is_solved INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0,
        hints_used INTEGER DEFAULT 0,
        time_taken INTEGER DEFAULT 0,
        last_played DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(question_id) REFERENCES questions(id)
    )`);
});

module.exports = db;