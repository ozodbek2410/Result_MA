module.exports = {
  apps: [
    {
      name: 'mathacademy-server',
      script: './server/dist/index.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 9999,
        MONGODB_URI: 'mongodb+srv://resultma2_db_user:10qyG6hxMdd8H2XW@cluster0.tlffh49.mongodb.net/test',
        JWT_SECRET: 'education_system_secret_key_2026'
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100
    }
  ]
};
