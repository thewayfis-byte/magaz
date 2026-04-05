const db = require('./db');

async function checkUsers() {
    try {
        const [users] = await db.execute('SELECT id, name, email, balance FROM users');
        console.log('👥 Пользователи в базе:');
        console.table(users);

        if (users.length === 0) {
            console.log('❌ Нет пользователей! Зарегистрируйтесь сначала.');
        }
    } catch (error) {
        console.error('Ошибка:', error);
    }
    process.exit();
}

checkUsers();