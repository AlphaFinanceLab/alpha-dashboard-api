require('dotenv').config();

module.exports = {
    apps : [{
      name: 'app',
      script: './build/api.js',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'development' ,
        WEBAPP_PORT: process.env.WEBAPP_PORT || '8080',
        DATABASE_URL: process.env.DATABASE_URL,
      },
    }]
}