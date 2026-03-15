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
  max: 20, // 20 failed attempts per 15 min
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many login attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`Rate limit: auth exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many login attempts',
      message: 'Juda ko\'p urinish. 15 daqiqadan keyin qayta urinib ko\'ring.',
      retryAfter: '15 minutes'
    });
  }
});

// Limiter for file uploads
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`Rate limit: upload exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many uploads',
      message: 'Fayl yuklash limiti oshdi. 1 soatdan keyin qayta urinib ko\'ring.',
      retryAfter: '1 hour'
    });
  }
});

// Limiter for OMR scanning
export const omrLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // 200 scans per hour
  message: {
    error: 'Too many scan requests, please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`Rate limit: OMR exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many scan requests',
      message: 'Skanerlash limiti oshdi. 1 soatdan keyin qayta urinib ko\'ring.',
      retryAfter: '1 hour'
    });
  }
});

// Limiter for AI parsing
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60, // 60 AI requests per hour
  message: {
    error: 'Too many AI parsing requests, please try again later.',
    retryAfter: '1 hour'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`Rate limit: AI parsing exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many AI parsing requests',
      message: 'AI tahlil limiti oshdi. 1 soatdan keyin qayta urinib ko\'ring.',
      retryAfter: '1 hour'
    });
  }
});

// Limiter for batch operations
export const batchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 batch operations per 15 min
  message: {
    error: 'Too many batch requests, please try again later.',
    retryAfter: '15 minutes'
  },
  handler: (req: Request, res: Response) => {
    console.warn(`Rate limit: batch exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many batch requests',
      message: 'Ommaviy so\'rovlar limiti oshdi. 15 daqiqadan keyin qayta urinib ko\'ring.',
      retryAfter: '15 minutes'
    });
  }
});
