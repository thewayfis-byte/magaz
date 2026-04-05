const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ТЕСТОВЫЕ КЛЮЧИ ЮKassa (работают без SSL проблем)
const SHOP_ID = '441141';
const SECRET_KEY = 'test_pUwec6sMSkT8f3J6cSZx3W-V8ju90MSogKE08OMOR0A';

const API_URL = 'https://api.yookassa.ru/v3';

async function createPayment(amount, description, returnUrl) {
    try {
        const paymentData = {
            amount: {
                value: amount.toString(),
                currency: "RUB"
            },
            confirmation: {
                type: "redirect",
                return_url: returnUrl
            },
            capture: true,
            description: description
        };

        const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

        const response = await axios.post(`${API_URL}/payments`, paymentData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`,
                'Idempotence-Key': uuidv4()
            },
            // Отключаем проверку SSL для теста (если проблема с сертификатами)
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        return {
            id: response.data.id,
            status: response.data.status,
            link: response.data.confirmation.confirmation_url
        };
    } catch (error) {
        console.error('YooKassa error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.description || 'Ошибка создания платежа');
    }
}

async function checkPaymentStatus(paymentId) {
    try {
        const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

        const response = await axios.get(`${API_URL}/payments/${paymentId}`, {
            headers: { 'Authorization': `Basic ${auth}` },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        return response.data.status === 'succeeded';
    } catch (error) {
        console.error('Error checking payment:', error);
        return false;
    }
}

async function getPaymentAmount(paymentId) {
    try {
        const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

        const response = await axios.get(`${API_URL}/payments/${paymentId}`, {
            headers: { 'Authorization': `Basic ${auth}` },
            httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
        });

        return parseFloat(response.data.amount.value);
    } catch (error) {
        console.error('Error getting amount:', error);
        return 0;
    }
}

module.exports = { createPayment, checkPaymentStatus, getPaymentAmount };