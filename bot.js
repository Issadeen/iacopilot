const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sgMail = require('@sendgrid/mail');

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
        '--single-process', // Important for Azure App Service
        '--disable-extensions'
    ],
    executablePath: process.platform === 'win32' 
        ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' 
        : '/usr/bin/google-chrome'
};

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: process.env.AZURE_STORAGE_PATH || './session' // Use Azure Storage if configured
    }),
    puppeteer: puppeteerConfig
});

// Keep track of QR code for Azure portal
let lastQR = '';

// Handle authentication failures
client.on('auth_failure', async (msg) => {
    console.error('Authentication failed:', msg);
    await handleReconnect();
});

// Handle disconnections
client.on('disconnected', async (reason) => {
    console.log('Client disconnected:', reason);
    isClientReady = false;
    await handleReconnect();
});

// Handle connection events
client.on('change_state', state => {
    console.log('Connection state:', state);
});

// Generate QR Code for WhatsApp Web
client.on('qr', (qr) => {
    console.log('Scan this QR code with your WhatsApp:');
    lastQR = qr;
    qrcode.generate(qr, { small: true });
});

// Add Azure health check endpoint
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        ready: isClientReady,
        qr: isClientReady ? null : lastQR
    });
});

app.get('/qr', (req, res) => {
    if (lastQR && !isClientReady) {
        res.status(200).json({ qr: lastQR });
    } else {
        res.status(404).json({ message: 'No QR code available or already authenticated' });
    }
});

client.on('ready', () => {
    console.log('WhatsApp bot is ready!');
    isClientReady = true;
    reconnectAttempts = 0;
});

// Handle incoming messages
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

// Handle errors
client.on('error', async (error) => {
    console.error('Client error:', error);
    if (!isClientReady) {
        await handleReconnect();
    }
});

// Reconnection handler
async function handleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('Max reconnection attempts reached. Please restart the bot manually.');
        process.exit(1);
    }

    reconnectAttempts++;
    console.log(`Attempting to reconnect... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    try {
        // Wait before attempting to reconnect
        await new Promise(resolve => setTimeout(resolve, RECONNECT_INTERVAL));
        
        if (!isClientReady) {
            await client.initialize();
        }
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        await handleReconnect();
    }
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Closing WhatsApp client...');
    try {
        await client.destroy();
    } catch (error) {
        console.error('Error while closing client:', error);
    }
    process.exit(0);
});

// Initialize both the WhatsApp client and Express server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

try {
    client.initialize();
} catch (error) {
    console.error('Failed to initialize client:', error);
    handleReconnect();
}