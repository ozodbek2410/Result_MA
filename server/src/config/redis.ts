import Redis from 'ioredis';

let redisClient: Redis | null = null;

export const connectRedis = async () => {
  try {
    // Проверяем, включен ли Redis в конфигурации
    if (process.env.REDIS_ENABLED !== 'true') {
      console.log('ℹ️  Redis disabled in configuration (set REDIS_ENABLED=true to enable)');
      return null;
    }

    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        // Останавливаем попытки после 3 раз
        if (times > 3) {
          console.log('⚠️  Redis connection failed after 3 attempts, continuing without cache');
          return null; // Останавливаем попытки
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true, // Не подключаться автоматически
    });

    // Пытаемся подключиться
    await redisClient.connect();

    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redisClient.on('error', (err) => {
      // Логируем только первую ошибку
      if (redisClient && (!redisClient.status || redisClient.status === 'connecting')) {
        console.error('❌ Redis connection error:', err.message);
        console.log('ℹ️  Continuing without Redis cache');
      }
    });

    return redisClient;
  } catch (error: any) {
    console.log('⚠️  Redis not available:', error.message);
    console.log('ℹ️  Continuing without cache (install Redis or set REDIS_ENABLED=false)');
    return null;
  }
};

export const getRedisClient = (): Redis | null => {
  return redisClient;
};

export const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
};
