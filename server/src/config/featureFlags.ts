/**
 * Feature flag helpers for teacher-group-subject scoping rollout.
 *
 * Rollout phases:
 *   Phase 1 — code deployed, both flags OFF (no behavior change)
 *   Phase 2 — READ=ON, WRITE=OFF, TEACHER_IDS=<test teachers>  (UI shows new data, no enforcement)
 *   Phase 3 — READ=ON, WRITE=ON,  TEACHER_IDS=<test teachers>  (enforcement for named teachers only)
 *   Phase 4 — READ=ON, WRITE=ON,  TEACHER_IDS=<empty>          (enforcement for all teachers)
 *
 * Rollback at any phase: set flag to false. Assignments stay in DB but are not consulted.
 */
import { getEnvConfig } from './env';

function inScope(teacherId: string | undefined): boolean {
  if (!teacherId) return false;
  const { TEACHER_SCOPING_TEACHER_IDS } = getEnvConfig();
  if (TEACHER_SCOPING_TEACHER_IDS.length === 0) return true; // all teachers
  return TEACHER_SCOPING_TEACHER_IDS.includes(teacherId);
}

export function isScopingReadEnabled(teacherId?: string): boolean {
  return getEnvConfig().TEACHER_SCOPING_READ && inScope(teacherId);
}

export function isScopingWriteEnabled(teacherId?: string): boolean {
  return getEnvConfig().TEACHER_SCOPING_WRITE && inScope(teacherId);
}
