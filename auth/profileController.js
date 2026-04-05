const db = require('../db');

// Получение профиля
async function getProfile(req, res) {
    console.log('=== getProfile START ===');
    console.log('Session ID:', req.sessionID);
    console.log('Session userId:', req.session.userId);

    if (!req.session.userId) {
        console.log('No userId in session');
        return res.status(401).json({ error: 'Не авторизован' });
    }

    try {
        const [users] = await db.execute(
            'SELECT id, name, email, balance FROM users WHERE id = ?',
            [req.session.userId]
        );

        console.log('Found users:', users.length);

        if (users.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = users[0];
        console.log('User data:', user);

        res.json({
            success: true,
            user: {
                id: user.id,
                name: user.name || 'Wayfis',
                email: user.email || 'Не привязан',
                balance: user.balance || 0
            }
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Обновление имени
async function updateName(req, res) {
    const { name } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Имя обязательно' });
    }

    try {
        await db.execute(
            'UPDATE users SET name = ? WHERE id = ?',
            [name.trim(), req.session.userId]
        );

        req.session.userName = name.trim();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Заглушки
async function sendEmailCode(req, res) {
    res.json({ success: true, message: 'В разработке' });
}

async function updateEmail(req, res) {
    res.json({ success: true, message: 'В разработке' });
}

async function updatePassword(req, res) {
    const { password } = req.body;

    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    const crypto = require('crypto');
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    try {
        await db.execute(
            'UPDATE users SET password = ? WHERE id = ?',
            [hashedPassword, req.session.userId]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

module.exports = {
    getProfile,
    updateName,
    sendEmailCode,
    updateEmail,
    updatePassword
};