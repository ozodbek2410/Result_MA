import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../env', () => ({
  getEnvConfig: vi.fn(),
}));

import { getEnvConfig } from '../env';
import { isScopingReadEnabled, isScopingWriteEnabled } from '../featureFlags';

const mockedGetEnv = vi.mocked(getEnvConfig);

function setEnv(cfg: Partial<ReturnType<typeof getEnvConfig>>) {
  mockedGetEnv.mockReturnValue({
    PORT: 0,
    MONGODB_URI: '',
    JWT_SECRET: '',
    NODE_ENV: 'test',
    UPLOAD_DIR: '',
    TEACHER_SCOPING_READ: false,
    TEACHER_SCOPING_WRITE: false,
    TEACHER_SCOPING_TEACHER_IDS: [],
    ...cfg,
  } as ReturnType<typeof getEnvConfig>);
}

describe('feature flag gating', () => {
  beforeEach(() => mockedGetEnv.mockReset());

  it('returns false when global flag is off', () => {
    setEnv({ TEACHER_SCOPING_READ: false });
    expect(isScopingReadEnabled('abc')).toBe(false);
  });

  it('returns true when flag is on and teacherIds list is empty (all users)', () => {
    setEnv({ TEACHER_SCOPING_READ: true, TEACHER_SCOPING_TEACHER_IDS: [] });
    expect(isScopingReadEnabled('any-teacher')).toBe(true);
  });

  it('gates by teacherIds allow-list when populated', () => {
    setEnv({
      TEACHER_SCOPING_WRITE: true,
      TEACHER_SCOPING_TEACHER_IDS: ['teacher-1', 'teacher-2'],
    });
    expect(isScopingWriteEnabled('teacher-1')).toBe(true);
    expect(isScopingWriteEnabled('teacher-999')).toBe(false);
    expect(isScopingWriteEnabled(undefined)).toBe(false);
  });
});
