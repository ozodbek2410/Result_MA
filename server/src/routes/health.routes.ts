import express from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis';
import { queueService } from '../services/queueService';

const router = express.Router();

/**
 * Basic health check
 * GET /api/health
 */
router.get('/', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        mongodb: mongoStatus,
        name: mongoose.connection.name || 'N/A'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

/**
 * Detailed health check with all services
 * GET /api/health/detailed
 */
router.get('/detailed', async (req, res) => {
  try {
    // MongoDB status
    const mongoStatus = mongoose.connection.readyState;
    const statusMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    const mongoStatusText = statusMap[mongoStatus] || 'unknown';

    // Redis status
    let redisStatus = 'disabled';
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.ping();
        redisStatus = 'connected';
      } catch (error) {
        redisStatus = 'error';
      }
    }

    // Queue status
    const queueStats = queueService.getStats();

    // Memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    };

    // CPU usage
    const cpuUsage = process.cpuUsage();

    // System info
    const systemInfo = {
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      uptimeFormatted: formatUptime(process.uptime()),
    };

    // Overall health status
    const isHealthy = mongoStatus === 1 && (redisStatus === 'connected' || redisStatus === 'disabled');
    const status = isHealthy ? 'healthy' : 'unhealthy';

    res.status(isHealthy ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      services: {
        mongodb: {
          status: mongoStatusText,
          healthy: mongoStatus === 1,
          database: mongoose.connection.name || 'N/A',
          host: mongoose.connection.host || 'N/A',
        },
        redis: {
          status: redisStatus,
          healthy: redisStatus === 'connected' || redisStatus === 'disabled',
        },
        queue: {
          status: 'operational',
          healthy: true,
          stats: queueStats,
        },
      },
      system: systemInfo,
      resources: {
        memory: memoryUsageMB,
        cpu: {
          user: Math.round(cpuUsage.user / 1000),
          system: Math.round(cpuUsage.system / 1000),
        },
      },
    });
  } catch (error: any) {
    console.error('Detailed health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/**
 * Readiness probe (for Kubernetes/Docker)
 * GET /api/health/ready
 */
router.get('/ready', async (req, res) => {
  try {
    const mongoReady = mongoose.connection.readyState === 1;
    
    if (mongoReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not connected',
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed',
    });
  }
});

/**
 * Liveness probe (for Kubernetes/Docker)
 * GET /api/health/live
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Format uptime in human-readable format
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

export default router;
