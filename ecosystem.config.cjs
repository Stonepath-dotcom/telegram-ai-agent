module.exports = {
  apps: [{
    name: 'telegram-ai-agent',
    script: 'src/index.js',
    env: {
      BOT_TOKEN: process.env.BOT_TOKEN || '',
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
  }],
};
