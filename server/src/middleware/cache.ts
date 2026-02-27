import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../config/redis';

/**
 * Middleware для кэширования GET запросов
 * @param ttl - время жизни кэша в секундах (по умолчанию 5 минут)
 */
export const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Кэшируем только GET запросы
    if (req.method !== 'GET') {
      return next();
    }

    const redis = getRedisClient();
    
    // Если Redis недоступен, пропускаем кэширование
    if (!redis) {
      return next();
    }

    try {
      // Создаем уникальный ключ на основе URL (БЕЗ query параметров для timestamp)
      // Убираем _t параметр из ключа кэша
      const url = req.originalUrl || req.url;
      const urlWithoutTimestamp = url.split('?')[0]; // Берем только путь без query
      const cacheKey = `cache:${urlWithoutTimestamp}`;
      
      // Проверяем наличие данных в кэше
      const cachedData = await redis.get(cacheKey);
      
      if (cachedData) {
        console.log(`✅ Cache HIT: ${cacheKey}`);
        return res.json(JSON.parse(cachedData));
      }

      console.log(`❌ Cache MISS: ${cacheKey}`);

      // Перехватываем оригинальный res.json
      const originalJson = res.json.bind(res);
      
      res.json = (body: any) => {
        // Сохраняем в кэш только успешные ответы
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redis.setex(cacheKey, ttl, JSON.stringify(body)).catch(err => {
            console.error('Redis cache save error:', err);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Инвалидация кэша по паттерну
 */
export const invalidateCache = async (pattern: string) => {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const keys = await redis.keys(`cache:${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️ Invalidated ${keys.length} cache keys matching: ${pattern}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};

/**
 * Очистка всего кэша
 */
export const clearAllCache = async () => {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const keys = await redis.keys('cache:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🗑️ Cleared ${keys.length} cache keys`);
    }
  } catch (error) {
    console.error('Clear cache error:', error);
  }
};
