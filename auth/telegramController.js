const db = require('../db');

// Генерация 6-значного кода
function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Запрос кода через Telegram
async function requestTelegramCode(req, res) {
    const { telegram_id, telegram_username } = req.body;

    if (!telegram_id) {
        return res.status(400).json({ error: 'Telegram ID обязателен' });
    }

    try {
        // Проверка существования пользователя
        const [existing] = await db.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegram_id]
        );

        let user;
        if (existing.length === 0) {
            // Регистрация нового пользователя
            await db.execute(
                'INSERT INTO users (telegram_id, telegram_username, is_verified) VALUES (?, ?, TRUE)',
                [telegram_id, telegram_username || null]
            );
            user = { telegram_id, telegram_username };
        } else {
            user = existing[0];
        }

        // Генерация кода
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут

        await db.execute(
            'INSERT INTO telegram_sessions (telegram_id, code, expires_at) VALUES (?, ?, ?)',
            [telegram_id, code, expiresAt]
        );

        // Код будет отправлен через бота (bot.js)
        // Сохраняем код в временное хранилище для бота
        if (!global.pendingCodes) global.pendingCodes = new Map();
        global.pendingCodes.set(telegram_id.toString(), {
            code: code,
            expiresAt: expiresAt
        });

        res.json({
            success: true,
            message: 'Код подтверждения отправлен в Telegram',
            telegram_id: telegram_id
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

// Подтверждение кода
async function verifyTelegramCode(req, res) {
    const { telegram_id, code } = req.body;

    try {
        const [session] = await db.execute(
            'SELECT * FROM telegram_sessions WHERE telegram_id = ? AND code = ? AND expires_at > NOW()',
            [telegram_id, code]
        );

        if (session.length === 0) {
            return res.status(400).json({ error: 'Неверный или просроченный код' });
        }

        // Получение пользователя
        const [user] = await db.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegram_id]
        );

        if (user.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Удаление использованной сессии
        await db.execute(
            'DELETE FROM telegram_sessions WHERE telegram_id = ? AND code = ?',
            [telegram_id, code]
        );

        // Сохранение сессии
        req.session.userId = telegram_id;
        req.session.telegramId = telegram_id;
        req.session.telegramUsername = user[0].telegram_username;

        res.json({ success: true, message: 'Вход через Telegram выполнен успешно' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
}

module.exports = { requestTelegramCode, verifyTelegramCode };