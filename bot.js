const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sgMail = require('@sendgrid/mail');
const express = require('express');
const path = require('path');

// Environment variables configuration
const sendGridApiKey = process.env.SENDGRID_API_KEY || 'your_sendgrid_api_key';
const emailTo = process.env.EMAIL_TO || 'recipient@example.com';
const emailFrom = process.env.EMAIL_FROM || 'sender@example.com';

sgMail.setApiKey(sendGridApiKey);

let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL = 5000;

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
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors'
    ],
    executablePath: process.platform === 'win32' 
        ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' 
        : '/usr/bin/google-chrome',
    userDataDir: process.env.AZURE_STORAGE_PATH 
        ? path.join(process.env.AZURE_STORAGE_PATH, 'chrome-data')
        : path.join(__dirname, 'chrome-data')
};

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Enable CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: process.env.AZURE_STORAGE_PATH || './session'
    }),
    puppeteer: puppeteerConfig
});

// Keep track of QR code for Azure portal
let lastQR = '';

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'Bot is running',
        endpoints: {
            qr: '/qr',
            health: '/health'
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    try {
        res.status(200).json({
            status: 'ok',
            ready: isClientReady,
            qr: isClientReady ? null : lastQR
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// QR code endpoint with error handling
app.get('/qr', (req, res) => {
    console.log('QR endpoint accessed. QR Status:', { hasQR: !!lastQR, isReady: isClientReady });
    try {
        if (lastQR && !isClientReady) {
            res.status(200).json({ 
                status: 'success',
                qr: lastQR,
                message: 'Scan this QR code with WhatsApp'
            });
        } else if (isClientReady) {
            res.status(200).json({ 
                status: 'authenticated',
                message: 'WhatsApp is already authenticated'
            });
        } else {
            res.status(202).json({ 
                status: 'waiting',
                message: 'QR code not yet generated. Please try again in a few seconds.'
            });
        }
    } catch (error) {
        console.error('QR endpoint error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Internal server error while fetching QR code'
        });
    }
});

// WhatsApp client event handlers
client.on('qr', (qr) => {
    console.log('New QR code generated. Access it at /qr endpoint');
    lastQR = qr;
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp bot is ready!');
    isClientReady = true;
    reconnectAttempts = 0;
});

client.on('auth_failure', async (msg) => {
    console.error('Authentication failed:', msg);
    await handleReconnect();
});

client.on('disconnected', async (reason) => {
    console.log('Client disconnected:', reason);
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
                to: emailTo,
                from: emailFrom,
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

// Error handler
async function handleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached. Please restart the bot manually.');
        process.exit(1);
    }

    reconnectAttempts++;
    console.log(`Attempting to reconnect... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    try {
        await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));
        if (!isClientReady) {
            await client.initialize();
        }
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        await handleReconnect();
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Closing WhatsApp client...');
    try {
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error while closing client:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT. Closing WhatsApp client...');
    try {
        await client.destroy();
        process.exit(0);
    } catch (error) {
        console.error('Error while closing client:', error);
        process.exit(1);
    }
});

// Start the server and initialize WhatsApp client
app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
    try {
        console.log('Initializing WhatsApp client...');
        client.initialize().catch(error => {
            console.error('Failed to initialize client:', error);
            handleReconnect();
        });
    } catch (error) {
        console.error('Failed to start initialization:', error);
        handleReconnect();
    }
});