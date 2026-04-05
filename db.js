const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

async function initDatabase() {
    try {
        // Таблица users
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255),
                email VARCHAR(255) UNIQUE,
                password VARCHAR(255),
                balance DECIMAL(10,2) DEFAULT 0,
                is_verified BOOLEAN DEFAULT FALSE,
                reset_token VARCHAR(255),
                reset_expires DATETIME,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Проверяем и добавляем колонку balance если её нет
        try {
            await promisePool.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 0`);
            console.log('✅ Колонка balance проверена/добавлена');
        } catch (err) {
            // Если колонка уже существует, игнорируем ошибку
            if (!err.message.includes('Duplicate column name')) {
                console.log('⚠️ Колонка balance уже существует или другая ошибка:', err.message);
            }
        }

        // Таблица email_verifications
        await promisePool.execute(`
            CREATE TABLE IF NOT EXISTS email_verifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255),
                code VARCHAR(10),
                expires_at DATETIME,
                type ENUM('register', 'login', 'link') DEFAULT 'register'
            )
        `);

        console.log('✅ Database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

initDatabase();

module.exports = promisePool;