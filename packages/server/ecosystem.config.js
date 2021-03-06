require('dotenv').config();

module.exports = {
    apps: [
        {
            name: 'app',
            script: './build/index.js',
            env: {
                NODE_ENV: process.env.NODE_ENV || 'development',
                WEBAPP_PORT: process.env.WEBAPP_PORT || '8080',
                DATABASE_URL: process.env.DATABASE_URL,
            },
        },
        // NOTE: disabling pm2 to manage the processes that perform data polling
        //       because it looks like pm2 may end up not closing the prisma connections (using cron now)
        /*
        {
            name: 'bsc_sync',
            script: './build/bsc/bsc_sync_events.js',
            cron_restart: "0-59/3 * * * *", // sync every 3 mins
            autorestart: false,
            time: true,
            kill_timeout: 1200000,
        },
        {
            name: 'eth_sync',
            script: './build/eth/eth_sync_events.js',
            cron_restart: "0-59/3 * * * *", // sync every 3 mins
            autorestart: false,
            time: true,
            kill_timeout: 1200000,
        },
        {
            name: 'eth_v2_sync',
            script: './build/ethV2/eth_v2_sync_events.js',
            cron_restart: "0-59/3 * * * *", // sync every 3 mins
            autorestart: false,
            time: true,
            kill_timeout: 1200000,
        },
        */
    ],
}