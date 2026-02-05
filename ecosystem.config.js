// Load environment variables from .env file
// Note: Make sure server/.env exists on production server
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });

module.exports = {
  apps: [{
    name: 'mathacademy-server',
    script: './server/dist/index.js',
    cwd: '/var/www/resultMA',  // Absolute path for production
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 9999,
      MONGODB_URI: process.env.MONGODB_URI,
      JWT_SECRET: process.env.JWT_SECRET,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      UPLOAD_DIR: process.env.UPLOAD_DIR || 'server/uploads',
      REDIS_ENABLED: process.env.REDIS_ENABLED || 'false',
      REDIS_HOST: process.env.REDIS_HOST || 'localhost',
      REDIS_PORT: process.env.REDIS_PORT || '6379',
      REDIS_PASSWORD: process.env.REDIS_PASSWORD
    },
    error_file: './logs/server-error.log',
    out_file: './logs/server-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    exp_backoff_restart_delay: 100
  }]
};
