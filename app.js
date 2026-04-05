const express = require('express');
const session = require('express-session');
const path = require('path');
const mysql = require('mysql2');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Создаем app
const app = express();

// Подключаем маршруты платежей
const paymentRoutes = require('./routes/payments');

// Добавьте после создания app, перед другими middleware:
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Для webhook ЮKassa
app.use('/api/webhook', express.raw({ type: 'application/json' }));

// Сессия
app.use(session({
    secret: 'wayfis-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// Подключаем маршруты платежей
app.use('/api', paymentRoutes);

// База данных
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'auth_system',
    waitForConnections: true,
    connectionLimit: 10
});

const db = pool.promise();

// Почта
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Функции
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ============== СТРАНИЦЫ ==============
app.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/dashboard');
    }
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ============== API АВТОРИЗАЦИИ ==============
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.json({ success: false, error: 'Email уже зарегистрирован' });
        }

        const hashedPassword = hashPassword(password);
        await db.execute(
            'INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, 0)',
            [name || 'Пользователь', email, hashedPassword]
        );

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60000);
        await db.execute(
            'INSERT INTO email_verifications (email, code, expires_at, type) VALUES (?, ?, ?, "register")',
            [email, code, expiresAt]
        );

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Код подтверждения - Wayfis',
            html: `<h2>Ваш код: ${code}</h2><p>Действителен 10 минут</p>`
        });

        res.json({ success: true, email: email });
    } catch (error) {
        console.error(error);
        res.json({ success: false, error: 'Ошибка сервера' });
    }
});

app.post('/verify-register', async (req, res) => {
    const { email, code } = req.body;

    try {
        const [verify] = await db.execute(
            'SELECT * FROM email_verifications WHERE email = ? AND code = ? AND type = "register" AND expires_at > NOW()',
            [email, code]
        );

        if (verify.length === 0) {
            return res.json({ success: false, error: 'Неверный код' });
        }

        await db.execute('UPDATE users SET is_verified = 1 WHERE email = ?', [email]);
        await db.execute('DELETE FROM email_verifications WHERE email = ?', [email]);

        const [user] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

        req.session.userId = user[0].id;
        req.session.userName = user[0].name;
        req.session.userEmail = user[0].email;

        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const hashedPassword = hashPassword(password);

    try {
        const [user] = await db.execute(
            'SELECT * FROM users WHERE email = ? AND password = ? AND is_verified = 1',
            [email, hashedPassword]
        );

        if (user.length === 0) {
            return res.json({ success: false, error: 'Неверный email или пароль' });
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60000);
        await db.execute(
            'INSERT INTO email_verifications (email, code, expires_at, type) VALUES (?, ?, ?, "login")',
            [email, code, expiresAt]
        );

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Код для входа - Wayfis',
            html: `<h2>Ваш код для входа: ${code}</h2><p>Действителен 10 минут</p>`
        });

        res.json({ success: true, email: email });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.post('/verify-login', async (req, res) => {
    const { email, code } = req.body;

    try {
        const [verify] = await db.execute(
            'SELECT * FROM email_verifications WHERE email = ? AND code = ? AND type = "login" AND expires_at > NOW()',
            [email, code]
        );

        if (verify.length === 0) {
            return res.json({ success: false, error: 'Неверный код' });
        }

        await db.execute('DELETE FROM email_verifications WHERE email = ?', [email]);

        const [user] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

        req.session.userId = user[0].id;
        req.session.userName = user[0].name;
        req.session.userEmail = user[0].email;

        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.post('/resend-code', async (req, res) => {
    const { email, type } = req.body;

    try {
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60000);

        await db.execute('DELETE FROM email_verifications WHERE email = ?', [email]);
        await db.execute(
            'INSERT INTO email_verifications (email, code, expires_at, type) VALUES (?, ?, ?, ?)',
            [email, code, expiresAt, type]
        );

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: type === 'register' ? 'Код подтверждения - Wayfis' : 'Код для входа - Wayfis',
            html: `<h2>Ваш код: ${code}</h2><p>Действителен 10 минут</p>`
        });

        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.post('/forgot-password', async (req, res) => {
    res.json({ message: 'Функция восстановления пароля в разработке' });
});

// ============== API ПРОФИЛЯ ==============
app.get('/api/profile', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ success: false, error: 'Не авторизован' });
    }

    try {
        const [users] = await db.execute(
            'SELECT id, name, email, balance FROM users WHERE id = ?',
            [req.session.userId]
        );

        if (users.length === 0) {
            return res.json({ success: false, error: 'Пользователь не найден' });
        }

        const user = users[0];
        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name || 'Wayfis',
                email: user.email || 'Не привязан',
                balance: parseFloat(user.balance) || 0
            }
        });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.post('/api/update-name', async (req, res) => {
    const { name } = req.body;

    if (!req.session.userId) {
        return res.json({ success: false, error: 'Не авторизован' });
    }

    try {
        await db.execute('UPDATE users SET name = ? WHERE id = ?', [name, req.session.userId]);
        req.session.userName = name;
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.post('/api/update-email', async (req, res) => {
    const { email } = req.body;

    if (!req.session.userId) {
        return res.json({ success: false, error: 'Не авторизован' });
    }

    try {
        await db.execute('UPDATE users SET email = ? WHERE id = ?', [email, req.session.userId]);
        req.session.userEmail = email;
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: 'Email уже используется' });
    }
});

app.post('/api/update-password', async (req, res) => {
    const { password } = req.body;

    if (!req.session.userId) {
        return res.json({ success: false, error: 'Не авторизован' });
    }

    try {
        const hashedPassword = hashPassword(password);
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.userId]);
        res.json({ success: true });
    } catch (error) {
        res.json({ success: false, error: 'Ошибка' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Wayfis server running on http://localhost:${PORT}`);
});