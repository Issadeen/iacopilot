const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sgMail = require('@sendgrid/mail');
const express = require('express');
const path = require('path');

// Verify required environment variables
const requiredEnvVars = [];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('Missing required environment variables:', missingVars);
    process.exit(1);
}

// Add basic application monitoring
const startTime = Date.now();
let requestCount = 0;
let isServerReady = false;

// Initialize Express app
const app = express();

// Get port from various environment variables that Azure might use
const port = process.env.PORT || process.env.WEBSITES_PORT || process.env.WEBSITE_PORT || 8080;

// Add request counter middleware
app.use((req, res, next) => {
    requestCount++;
    next();
});

// Add readiness check middleware
app.use((req, res, next) => {
    if (!isServerReady && req.path !== '/health') {
        return res.status(503).json({
            error: 'Service is starting up',
            timestamp: new Date().toISOString()
        });
    }
    next();
});

// Add detailed request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Environment:', {
        PORT: port,
        NODE_ENV: process.env.NODE_ENV,
        PWD: process.cwd()
    });
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
        timestamp: new Date().toISOString()
    });
});

// Enhanced health check endpoint with more diagnostics
app.get('/health', (req, res) => {
    const healthStatus = {
        status: isServerReady ? 'ok' : 'starting',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        diagnostics: {
            uptime: Math.floor((Date.now() - startTime) / 1000),
            requestCount: requestCount,
            memory: process.memoryUsage(),
            pid: process.pid,
            node_version: process.version,
            platform: process.platform,
            arch: process.arch,
            env: {
                NODE_ENV: process.env.NODE_ENV,
                PORT: port
            }
        }
    };
    
    console.log('Health check response:', healthStatus);
    res.json(healthStatus);
});

// Basic alive check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'WhatsApp Bot is running',
        diagnostics: {
            uptime: Math.floor((Date.now() - startTime) / 1000),
            requestCount: requestCount
        }
    });
});

// Handle process signals
process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed. Exiting process...');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT. Performing graceful shutdown...');
    server.close(() => {
        console.log('Server closed. Exiting process...');
        process.exit(0);
    });
});

// Uncaught error handlers
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Log error details before exiting
    console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server with explicit host binding and error handling
const server = app.listen(port, '0.0.0.0', (err) => {
    if (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
    
    isServerReady = true;
    console.log(`Server is running at http://0.0.0.0:${port}`);
    console.log('Environment:', {
        NODE_ENV: process.env.NODE_ENV,
        PORT: port,
        PWD: process.cwd(),
        PLATFORM: process.platform
    });
});