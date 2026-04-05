const express = require('express');
const router = express.Router();
const db = require('../db');
const yookassa = require('../config/yookassa');

// Создание платежа через ЮKassa
router.post('/create-payment', async (req, res) => {
    console.log('=== CREATE PAYMENT ===');

    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { amount } = req.body;

    if (!amount || amount < 10) {
        return res.status(400).json({ error: 'Минимальная сумма 10 рублей' });
    }

    if (amount > 100000) {
        return res.status(400).json({ error: 'Максимальная сумма 100000 рублей' });
    }

    try {
        const returnUrl = `http://localhost:${process.env.PORT || 3000}/api/payment-callback`;
        const description = `Пополнение баланса на сумму ${amount} ₽`;

        // Создаем платеж в ЮKassa
        const payment = await yookassa.createPayment(amount, description, returnUrl);

        // Сохраняем платеж в БД
        const [result] = await db.execute(
            'INSERT INTO payments (user_id, amount, payment_id, status) VALUES (?, ?, ?, ?)',
            [req.session.userId, amount, payment.id, 'pending']
        );

        // Создаем счет
        await db.execute(
            'INSERT INTO invoices (user_id, payment_id, amount, type, status, description) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.userId, result.insertId, amount, 'deposit', 'pending', description]
        );

        res.json({
            success: true,
            paymentId: payment.id,
            confirmationUrl: payment.link
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Callback после оплаты (куда возвращается пользователь)
router.get('/payment-callback', async (req, res) => {
    const { paymentId } = req.query;

    console.log('=== PAYMENT CALLBACK ===');
    console.log('PaymentId:', paymentId);

    if (!paymentId) {
        return res.redirect('/dashboard?page=topup&error=no_payment');
    }

    try {
        // Проверяем статус платежа
        const isPaid = await yookassa.checkPaymentStatus(paymentId);

        if (isPaid) {
            const amount = await yookassa.getPaymentAmount(paymentId);

            // Находим платеж в БД
            const [payments] = await db.execute(
                'SELECT * FROM payments WHERE payment_id = ?',
                [paymentId]
            );

            if (payments.length > 0 && payments[0].status !== 'succeeded') {
                const payment = payments[0];

                // Обновляем статус
                await db.execute('UPDATE payments SET status = ? WHERE id = ?', ['succeeded', payment.id]);
                await db.execute('UPDATE invoices SET status = ? WHERE payment_id = ?', ['paid', payment.id]);
                await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, payment.user_id]);

                console.log(`Payment succeeded! Added ${amount} to user ${payment.user_id}`);
            }
        }

        res.redirect('/dashboard?page=invoices&success=paid');
    } catch (error) {
        console.error('Callback error:', error);
        res.redirect('/dashboard?page=topup&error=payment_failed');
    }
});

// Простое пополнение (для теста, без оплаты)
router.post('/topup-test', async (req, res) => {
    console.log('=== TEST TOPUP ===');

    if (!req.session || !req.session.userId) {
        return res.json({ success: false, error: 'Не авторизован' });
    }

    const { amount } = req.body;

    if (!amount || amount < 10) {
        return res.json({ success: false, error: 'Минимальная сумма 10 рублей' });
    }

    try {
        await db.execute(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [parseFloat(amount), req.session.userId]
        );

        const [users] = await db.execute('SELECT balance FROM users WHERE id = ?', [req.session.userId]);

        res.json({
            success: true,
            message: `Баланс пополнен на ${amount} ₽ (тестовый режим)`,
            newBalance: users[0]?.balance || 0
        });
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Получение счетов
router.get('/invoices', async (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    try {
        const [invoices] = await db.execute(
            'SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC',
            [req.session.userId]
        );

        res.json({ success: true, invoices });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка загрузки счетов' });
    }
});

module.exports = router;