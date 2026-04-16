/**
 * Environment variables validation
 * Проверяет наличие всех обязательных переменных окружения при старте
 */

interface EnvConfig {
  PORT: number;
  MONGODB_URI: string;
  JWT_SECRET: string;
  NODE_ENV: 'development' | 'production' | 'test';
  UPLOAD_DIR: string;
  GROQ_API_KEY?: string;
  REDIS_ENABLED?: boolean;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_PASSWORD?: string;
  TEACHER_SCOPING_READ: boolean;
  TEACHER_SCOPING_WRITE: boolean;
  TEACHER_SCOPING_TEACHER_IDS: string[];
}

/**
 * Validate and parse environment variables
 */
export function validateEnv(): EnvConfig {
  const requiredVars = ['MONGODB_URI', 'JWT_SECRET', 'PORT'];
  
  // Check required variables
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `❌ Missing required environment variables: ${missing.join(', ')}\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }

  // Parse and validate PORT
  const port = parseInt(process.env.PORT || '5000', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`❌ Invalid PORT: ${process.env.PORT}. Must be a number between 1 and 65535.`);
  }

  // Validate NODE_ENV
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    console.warn(`⚠️  Invalid NODE_ENV: ${nodeEnv}. Using 'development' as default.`);
  }

  // Parse Redis config
  const redisEnabled = process.env.REDIS_ENABLED === 'true';
  const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379;

  // Teacher scoping feature flags (staged rollout)
  const teacherScopingRead = process.env.TEACHER_SCOPING_READ === 'true';
  const teacherScopingWrite = process.env.TEACHER_SCOPING_WRITE === 'true';
  const teacherScopingTeacherIds = (process.env.TEACHER_SCOPING_TEACHER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const config: EnvConfig = {
    PORT: port,
    MONGODB_URI: process.env.MONGODB_URI!,
    JWT_SECRET: process.env.JWT_SECRET!,
    NODE_ENV: nodeEnv as 'development' | 'production' | 'test',
    UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    REDIS_ENABLED: redisEnabled,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: redisPort,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    TEACHER_SCOPING_READ: teacherScopingRead,
    TEACHER_SCOPING_WRITE: teacherScopingWrite,
    TEACHER_SCOPING_TEACHER_IDS: teacherScopingTeacherIds,
  };

  // Log configuration (without sensitive data)
  console.log('\n📋 Environment Configuration:');
  console.log(`   NODE_ENV: ${config.NODE_ENV}`);
  console.log(`   PORT: ${config.PORT}`);
  console.log(`   MONGODB_URI: ${config.MONGODB_URI.substring(0, 20)}...`);
  console.log(`   JWT_SECRET: ${config.JWT_SECRET ? '✓ Set' : '✗ Missing'}`);
  console.log(`   UPLOAD_DIR: ${config.UPLOAD_DIR}`);
  console.log(`   GROQ_API_KEY: ${config.GROQ_API_KEY ? `✓ Set (${config.GROQ_API_KEY.split(',').length} keys)` : '✗ Not set'}`);
  console.log(`   REDIS: ${config.REDIS_ENABLED ? `✓ Enabled (${config.REDIS_HOST}:${config.REDIS_PORT})` : '✗ Disabled'}`);
  const scopingLabel = config.TEACHER_SCOPING_TEACHER_IDS.length
    ? `(only ${config.TEACHER_SCOPING_TEACHER_IDS.length} teachers)`
    : '(all teachers)';
  console.log(`   TEACHER_SCOPING_READ:  ${config.TEACHER_SCOPING_READ ? `✓ ON ${scopingLabel}` : '✗ OFF'}`);
  console.log(`   TEACHER_SCOPING_WRITE: ${config.TEACHER_SCOPING_WRITE ? `✓ ON ${scopingLabel}` : '✗ OFF'}`);
  console.log('');

  return config;
}

/**
 * Get environment config (singleton)
 */
let envConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!envConfig) {
    envConfig = validateEnv();
  }
  return envConfig;
}
