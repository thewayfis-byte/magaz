const db = require('../db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

// Настройка почты
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Регистрация
async function register(req, res) {
    const { name, email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    try {
        const [existing] = await db.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }

        const hashedPassword = hashPassword(password);

        await db.execute(
            'INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, 0)',
            [name || 'Пользователь', email, hashedPassword]
        );

        // Генерируем код
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.execute(
            'DELETE FROM email_verifications WHERE email = ?',
            [email]
        );

        await db.execute(
            'INSERT INTO email_verifications (email, code, expires_at, type) VALUES (?, ?, ?, "register")',
            [email, code, expiresAt]
        );

        // Отправляем письмо
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Код подтверждения - Wayfis',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                    <h2>Добро пожаловать в Wayfis!</h2>
                    <p>Ваш код подтверждения:</p>
                    <div style="font-size: 32px; font-weight: bold; padding: 20px; background: #f0f0f0; text-align: center; letter-spacing: 5px;">
                        ${code}
                    </div>
                    <p>Код действителен в течение 10 минут.</p>
                </div>
            `
        });

        res.json({ success: true, message: 'Код отправлен на почту', email: email });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Ошибка сервера: ' + error.message });
    }
}

// Подтверждение кода при регистрации
async function verifyCode(req, res) {
    const { email, code, type } = req.body;

    try {
        const [verification] = await db.execute(
            'SELECT * FROM email_verifications WHERE email = ? AND code = ? AND type = ? AND expires_at > NOW()',
            [email, code, type]
        );

        if (verification.length === 0) {
            return res.status(400).json({ error: 'Неверный или просроченный код' });
        }

        if (type === 'register') {
            await db.execute(
                'UPDATE users SET is_verified = 1 WHERE email = ?',
                [email]
            );
        }

        await db.execute(
            'DELETE FROM email_verifications WHERE email = ?',
            [email]
        );

        const [user] = await db.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (user.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        req.session.userId = user[0].id;
        req.session.userName = user[0].name;
        req.session.userEmail = user[0].email;

        res.json({ success: true, message: 'Успешно' });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Вход (отправка кода)
async function login(req, res) {
    const { email, password } = req.body;
    const hashedPassword = hashPassword(password);

    try {
        const [user] = await db.execute(
            'SELECT * FROM users WHERE email = ? AND password = ? AND is_verified = 1',
            [email, hashedPassword]
        );

        if (user.length === 0) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Генерируем код для входа
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.execute(
            'DELETE FROM email_verifications WHERE email = ?',
            [email]
        );

        await db.execute(
            'INSERT INTO email_verifications (email, code, expires_at, type) VALUES (?, ?, ?, "login")',
            [email, code, expiresAt]
        );

        // Отправляем письмо
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Код для входа - Wayfis',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                    <h2>Код для входа в Wayfis</h2>
                    <p>Ваш код:</p>
                    <div style="font-size: 32px; font-weight: bold; padding: 20px; background: #f0f0f0; text-align: center; letter-spacing: 5px;">
                        ${code}
                    </div>
                    <p>Код действителен в течение 10 минут.</p>
                </div>
            `
        });

        res.json({ success: true, message: 'Код отправлен на почту', email: email });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Подтверждение входа
async function verifyLoginCode(req, res) {
    const { email, code } = req.body;

    try {
        const [verification] = await db.execute(
            'SELECT * FROM email_verifications WHERE email = ? AND code = ? AND type = "login" AND expires_at > NOW()',
            [email, code]
        );

        if (verification.length === 0) {
            return res.status(400).json({ error: 'Неверный или просроченный код' });
        }

        await db.execute(
            'DELETE FROM email_verifications WHERE email = ?',
            [email]
        );

        const [user] = await db.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        req.session.userId = user[0].id;
        req.session.userName = user[0].name;
        req.session.userEmail = user[0].email;

        res.json({ success: true, message: 'Вход выполнен' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

async function forgotPassword(req, res) {
    res.json({ message: 'В разработке' });
}

async function resendCode(req, res) {
    const { email, type } = req.body;

    try {
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.execute(
            'DELETE FROM email_verifications WHERE email = ?',
            [email]
        );

        await db.execute(
            'INSERT INTO email_verifications (email, code, expires_at, type) VALUES (?, ?, ?, ?)',
            [email, code, expiresAt, type]
        );

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: type === 'register' ? 'Код подтверждения - Wayfis' : 'Код для входа - Wayfis',
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Ваш код: ${code}</h2>
                    <p>Код действителен 10 минут.</p>
                </div>
            `
        });

        res.json({ success: true, message: 'Код отправлен заново' });

    } catch (error) {
        res.status(500).json({ error: 'Ошибка отправки' });
    }
}

module.exports = {
    register,
    login,
    verifyCode,
    verifyLoginCode,
    forgotPassword,
    resendCode
};