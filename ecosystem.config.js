module.exports = {
  apps: [{
    name: 'whatsapp-bot',
    script: 'bot.js',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
    }
  }]
};