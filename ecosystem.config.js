require('dotenv').config();

module.exports = {
    apps: [
        {
            name: 'app',
            script: './build/api.js',
            env: {
                NODE_ENV: process.env.NODE_ENV || 'development',
                WEBAPP_PORT: process.env.WEBAPP_PORT || '8080',
                DATABASE_URL: process.env.DATABASE_URL,
            },
        },
        {
            name: 'bsc_sync',
            script: './build/bsc/bsc_sync_events.js',
            cron_restart: "0-59/3 * * * *", // sync every 3 mins
            autorestart: false,
            time: true,
            kill_timeout: 1200000,
        },
    ],
}