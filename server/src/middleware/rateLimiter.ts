import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Rate limiting middleware to prevent abuse
 */

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Увеличено с 100 до 500 запросов за 15 минут (более реалистично для SPA)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for certain paths
  skip: (req: Request) => {
    // Не ограничиваем статические файлы и health checks
    return req.path.startsWith('/health') || 
           req.path.startsWith('/static') ||
           req.path.startsWith('/public');
  },
  handler: (req: Request, res: Response) => {
    console.warn(`⚠️  Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Увеличено с 5 до 10 попыток (более удобно для пользователей)
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    error: 'Too many login attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`⚠️  Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Your account has been temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
      retryAfter: '15 minutes'
    });
  }
});

// Limiter for file uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Увеличено с 20 до 50 загрузок в час
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`⚠️  Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many uploads',
      message: 'You have exceeded the upload limit. Please try again in 1 hour.',
      retryAfter: '1 hour'
    });
  }
});

// Limiter for OMR scanning (expensive operation)
export const omrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Увеличено с 50 до 100 сканирований в час
  message: {
    error: 'Too many scan requests, please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`⚠️  OMR rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many scan requests',
      message: 'You have exceeded the scan limit. Please try again in 1 hour.',
      retryAfter: '1 hour'
    });
  }
});

// Limiter for AI parsing (expensive operation)
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // Увеличено с 30 до 60 AI запросов в час
  message: {
    error: 'Too many AI parsing requests, please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`⚠️  AI parsing rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many AI parsing requests',
      message: 'You have exceeded the AI parsing limit. Please try again in 1 hour.',
      retryAfter: '1 hour'
    });
  }
});

// Более мягкий лимитер для batch операций
export const batchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 batch запросов за 15 минут
  message: {
    error: 'Too many batch requests, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`⚠️  Batch rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many batch requests',
      message: 'You have exceeded the batch request limit. Please try again later.',
      retryAfter: '15 minutes'
    });
  }
});
