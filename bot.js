const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sgMail = require('@sendgrid/mail');
const express = require('express');
const path = require('path');

// Initialize Express app first
const app = express();

// Get port from environment variables
const port = process.env.WEBSITES_PORT || process.env.PORT || 8080;

// Debug middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

// WhatsApp client state
let isClientReady = false;
let lastQR = '';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Azure-specific puppeteer configuration
const puppeteerConfig = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',
        '--disable-extensions'
    ]
};

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: process.env.AZURE_STORAGE_PATH || './session'
    }),
    puppeteer: puppeteerConfig
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'WhatsApp bot is running',
        serverTime: new Date().toISOString(),
        ready: isClientReady,
        endpoints: {
            health: '/health',
            qr: '/qr'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.json({
        status: 'ok',
        ready: isClientReady,
        timestamp: new Date().toISOString(),
        port: port,
        uptime: process.uptime()
    });
});

// QR code endpoint
app.get('/qr', (req, res) => {
    console.log('QR code requested. Status:', { hasQR: !!lastQR, isReady: isClientReady });
    if (lastQR && !isClientReady) {
        res.json({ qr: lastQR });
    } else if (isClientReady) {
        res.json({ status: 'authenticated' });
    } else {
        res.status(404).json({ message: 'QR code not available' });
    }
});

// WhatsApp event handlers
client.on('qr', (qr) => {
    console.log('New QR code generated');
    lastQR = qr;
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready!');
    isClientReady = true;
    reconnectAttempts = 0;
});

client.on('auth_failure', async () => {
    console.log('Auth failure, attempting to reconnect');
    isClientReady = false;
    await handleReconnect();
});

client.on('disconnected', async () => {
    console.log('Client disconnected');
    isClientReady = false;
    await handleReconnect();
});

// Message handler
client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        
        if (message.body.toLowerCase() === 'hello') {
            await chat.sendMessage('Hello! How can I assist you today?');
        } 
        else if (message.body.toLowerCase().startsWith('email')) {
            const emailContent = message.body.substring(6).trim();
            const email = {
                to: process.env.EMAIL_TO || 'recipient@example.com',
                from: process.env.EMAIL_FROM || 'sender@example.com',
                subject: 'Message from WhatsApp Bot',
                text: emailContent,
            };

            try {
                await sgMail.send(email);
                await chat.sendMessage('Email sent successfully!');
            } catch (error) {
                console.error('Error sending email:', error);
                await chat.sendMessage('Failed to send email.');
            }
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// Reconnection handler
async function handleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached');
        return;
    }

    reconnectAttempts++;
    console.log(`Attempting to reconnect... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    try {
        await client.initialize();
    } catch (error) {
        console.error('Reconnection failed:', error);
        setTimeout(handleReconnect, 5000);
    }
}

// Start server and initialize WhatsApp client
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
    console.log('Starting WhatsApp client initialization...');
    
    // Initialize WhatsApp client
    client.initialize().catch(error => {
        console.error('Failed to initialize WhatsApp client:', error);
        handleReconnect();
    });
});