/**
 * Structured logging utility
 * Provides consistent logging across the application
 */

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: any;
  error?: {
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDevelopment: boolean;
  private minLevel: LogLevel;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    // Устанавливаем минимальный уровень логирования из переменной окружения
    const envLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.minLevel = LogLevel[envLevel as keyof typeof LogLevel] || LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    return levels.indexOf(level) <= levels.indexOf(this.minLevel);
  }

  private formatLog(entry: LogEntry): string {
    const { timestamp, level, message, context, data, error } = entry;
    
    // Color codes for terminal
    const colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[90m', // Gray
      RESET: '\x1b[0m',
    };

    const color = colors[level] || colors.RESET;
    const contextStr = context ? `[${context}]` : '';
    
    // Короткий формат времени (только время, без даты)
    const time = new Date(timestamp).toLocaleTimeString('ru-RU');
    
    // Компактный формат: время [контекст] сообщение
    let logStr = `${color}${time} ${contextStr} ${message}${colors.RESET}`;
    
    // Данные показываем только в development и только если они важные
    if (data && this.isDevelopment && Object.keys(data).length > 0) {
      logStr += ` ${JSON.stringify(data)}`;
    }
    
    // Ошибки показываем компактно
    if (error) {
      logStr += ` - ${error.message}`;
      // Stack trace только в development
      if (error.stack && this.isDevelopment) {
        logStr += `\n${error.stack}`;
      }
    }
    
    return logStr;
  }

  private log(level: LogLevel, message: string, context?: string, data?: any, error?: Error) {
    // Проверяем, нужно ли логировать этот уровень
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      data,
      error: error ? {
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    const formatted = this.formatLog(entry);
    
    // Output to console
    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  error(message: string, error?: Error, context?: string, data?: any) {
    this.log(LogLevel.ERROR, message, context, data, error);
  }

  warn(message: string, context?: string, data?: any) {
    this.log(LogLevel.WARN, message, context, data);
  }

  info(message: string, context?: string, data?: any) {
    this.log(LogLevel.INFO, message, context, data);
  }

  debug(message: string, context?: string, data?: any) {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  // Convenience methods for common scenarios
  
  apiRequest(method: string, path: string, userId?: string) {
    // Логируем только в DEBUG режиме
    this.debug(`${method} ${path}`, 'API', userId ? { userId } : undefined);
  }

  apiResponse(method: string, path: string, statusCode: number, duration: number) {
    // Логируем только ошибки и медленные запросы
    if (statusCode >= 400) {
      this.warn(`${method} ${path} - ${statusCode} (${duration}ms)`, 'API');
    } else if (duration > 1000) {
      this.warn(`${method} ${path} - медленный запрос (${duration}ms)`, 'API');
    } else {
      this.debug(`${method} ${path} - ${statusCode} (${duration}ms)`, 'API');
    }
  }

  dbQuery(operation: string, collection: string, duration?: number) {
    // Логируем только медленные запросы
    if (duration && duration > 500) {
      this.warn(`${operation} ${collection} - медленный запрос (${duration}ms)`, 'DB');
    } else {
      this.debug(`${operation} ${collection}`, 'DB');
    }
  }

  cacheHit(key: string) {
    this.debug(`HIT: ${key}`, 'CACHE');
  }

  cacheMiss(key: string) {
    this.debug(`MISS: ${key}`, 'CACHE');
  }

  queueJob(jobType: string, jobId: string) {
    this.info(`${jobType} запущен`, 'QUEUE');
  }

  queueComplete(jobType: string, jobId: string, duration: number) {
    this.info(`${jobType} завершен (${duration}ms)`, 'QUEUE');
  }

  queueFailed(jobType: string, jobId: string, error: Error) {
    this.error(`${jobType} ошибка`, error, 'QUEUE');
  }
}

// Export singleton instance
export const logger = new Logger();

// Export for testing
export default logger;
