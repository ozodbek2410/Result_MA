import NodeCache from 'node-cache';

/**
 * Cache Service with automatic invalidation
 * 
 * TTL (Time To Live):
 * - Reference data (subjects, branches): 30 minutes (1800s)
 * - Lists (students, teachers): 10 minutes (600s)
 * - Statistics (testResults): 5 minutes (300s)
 */
class CacheService {
  private cache: NodeCache;
  private isEnabled: boolean;

  constructor() {
    this.cache = new NodeCache({
      stdTTL: 600, // Default TTL: 10 minutes
      checkperiod: 120, // Check for expired keys every 2 minutes
      useClones: false, // Don't clone objects (better performance)
      deleteOnExpire: true,
    });

    // Enable cache only in production or when explicitly enabled
    this.isEnabled = process.env.NODE_CACHE_ENABLED === 'true' || process.env.NODE_ENV === 'production';
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    if (!this.isEnabled) return undefined;
    return this.cache.get<T>(key);
  }

  /**
   * Set value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttl?: number): boolean {
    if (!this.isEnabled) return false;
    return this.cache.set(key, value, ttl || 600);
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): number {
    if (!this.isEnabled) return 0;
    return this.cache.del(key);
  }

  /**
   * Delete all keys matching pattern
   * Example: deletePattern('students:') deletes all keys starting with 'students:'
   */
  deletePattern(pattern: string): number {
    if (!this.isEnabled) return 0;

    const keys = this.cache.keys();
    const matchingKeys = keys.filter(key => key.startsWith(pattern));
    
    if (matchingKeys.length === 0) return 0;

    return this.cache.del(matchingKeys);
  }

  /**
   * Invalidate multiple patterns at once
   * Example: invalidate(['students:', 'statistics:'])
   */
  invalidate(patterns: string[]): number {
    if (!this.isEnabled) return 0;

    let totalDeleted = 0;
    patterns.forEach(pattern => {
      totalDeleted += this.deletePattern(pattern);
    });

    return totalDeleted;
  }

  /**
   * Clear all cache
   */
  flush(): void {
    if (!this.isEnabled) return;
    this.cache.flushAll();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.cache.getStats();
  }

  /**
   * Check if cache is enabled
   */
  isActive(): boolean {
    return this.isEnabled;
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Export TTL constants for consistency
export const CacheTTL = {
  REFERENCE: 1800,  // 30 minutes - for subjects, branches, directions
  LIST: 600,        // 10 minutes - for students, teachers, groups
  STATISTICS: 300,  // 5 minutes - for test results, statistics
  SHORT: 60,        // 1 minute - for frequently changing data
} as const;

/**
 * Cache invalidation strategies
 * 
 * When data changes, invalidate related caches:
 * 
 * Student changes → invalidate: students:*, testResults:*, statistics:*
 * Teacher changes → invalidate: teachers:*, groups:*
 * Subject changes → invalidate: subjects:*, tests:*, blockTests:*
 * Test changes → invalidate: tests:*, testResults:*, statistics:*
 * TestResult changes → invalidate: testResults:*, statistics:*
 * Group changes → invalidate: groups:*, students:*
 * Branch changes → invalidate: branches:*, students:*, teachers:*, groups:*
 */
export const CacheInvalidation = {
  onStudentChange: () => cacheService.invalidate(['students:', 'testResults:', 'statistics:']),
  onTeacherChange: () => cacheService.invalidate(['teachers:', 'groups:']),
  onSubjectChange: () => cacheService.invalidate(['subjects:', 'tests:', 'blockTests:']),
  onTestChange: () => cacheService.invalidate(['tests:', 'testResults:', 'statistics:']),
  onTestResultChange: () => cacheService.invalidate(['testResults:', 'statistics:']),
  onGroupChange: () => cacheService.invalidate(['groups:', 'students:']),
  onBranchChange: () => cacheService.invalidate(['branches:', 'students:', 'teachers:', 'groups:']),
  onBlockTestChange: () => cacheService.invalidate(['blockTests:', 'testResults:', 'statistics:']),
} as const;
