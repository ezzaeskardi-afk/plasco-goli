// اجرای پایدار در پروداکشن با pm2:
//   npm i -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup   ← بعد از ریبوت سرور هم خودش بالا می‌آید
module.exports = {
  apps: [{
    name: 'polasco-goli',
    script: 'server.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production', PORT: 3000 },
    autorestart: true,          // اگر کرش کرد، فوری دوباره بالا بیاید
    max_memory_restart: '300M', // نشتی حافظه‌ی احتمالی = ری‌استارت تمیز
    time: true                  // لاگ‌ها با زمان
  }]
};
