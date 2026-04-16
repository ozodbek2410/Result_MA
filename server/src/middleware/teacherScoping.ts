import { Response, NextFunction } from 'express';
import mongoose, { Types } from 'mongoose';
import User, { UserRole } from '../models/User';
import TeacherGroupAssignment from '../models/TeacherGroupAssignment';
import PermissionAuditLog from '../models/PermissionAuditLog';
import { logger } from '../config/logger';
import { isScopingWriteEnabled } from '../config/featureFlags';
import { AuthRequest } from './auth';

const PRIVILEGED_ROLES: string[] = [UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN, UserRole.METHODIST];

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function isPrivileged(role: string | undefined): boolean {
  return !!role && PRIVILEGED_ROLES.includes(role);
}

async function audit(
  req: AuthRequest,
  action: string,
  resourceType: 'subject' | 'group' | 'groupSubject',
  resourceIds: string[],
  outcome: 'allowed' | 'denied',
  reason?: string
): Promise<void> {
  try {
    await PermissionAuditLog.create({
      userId: new Types.ObjectId(req.user!.id),
      username: (req.user as unknown as { username?: string })?.username || 'unknown',
      role: req.user!.role,
      action,
      resourceType,
      resourceIds,
      outcome,
      reason,
      method: req.method,
      path: req.originalUrl || req.path,
    });
  } catch (err) {
    logger.warn(`PermissionAuditLog write failed: ${err instanceof Error ? err.message : String(err)}`, 'SCOPING');
  }
}

export async function canAccessSubject(userId: string, subjectId: string): Promise<boolean> {
  if (!isObjectId(userId) || !isObjectId(subjectId)) return false;
  const user = await User.findById(userId).select('role teacherSubjects').lean();
  if (!user) return false;
  if (isPrivileged(user.role)) return true;
  return (user.teacherSubjects || []).some(s => s.toString() === subjectId);
}

export async function canAccessGroup(userId: string, groupId: string): Promise<boolean> {
  if (!isObjectId(userId) || !isObjectId(groupId)) return false;
  const user = await User.findById(userId).select('role').lean();
  if (!user) return false;
  if (isPrivileged(user.role)) return true;
  const hit = await TeacherGroupAssignment.exists({
    teacherId: new Types.ObjectId(userId),
    groupId: new Types.ObjectId(groupId),
    isActive: true,
  });
  return !!hit;
}

export async function canAccessGroupSubject(
  userId: string,
  groupId: string,
  subjectId: string
): Promise<boolean> {
  if (!isObjectId(userId) || !isObjectId(groupId) || !isObjectId(subjectId)) return false;
  const user = await User.findById(userId).select('role').lean();
  if (!user) return false;
  if (isPrivileged(user.role)) return true;
  const hit = await TeacherGroupAssignment.exists({
    teacherId: new Types.ObjectId(userId),
    groupId: new Types.ObjectId(groupId),
    subjectId: new Types.ObjectId(subjectId),
    isActive: true,
  });
  return !!hit;
}

type FieldSource = 'body' | 'params' | 'query';

function readField(
  req: AuthRequest,
  source: FieldSource,
  field: string
): string | undefined {
  const bag = (req as unknown as Record<string, Record<string, unknown>>)[source] || {};
  const v = bag[field];
  return typeof v === 'string' ? v : undefined;
}

interface RequireOptions {
  source?: FieldSource;
  field?: string;
  action: string;
}

/**
 * Require that the current user is authorized to operate on the given subjectId.
 * Gated by TEACHER_SCOPING_WRITE feature flag — when off, middleware is a no-op
 * (still runs authenticate, but skips the ownership check).
 */
export function requireSubject(opts: RequireOptions) {
  const source = opts.source || 'body';
  const field = opts.field || 'subjectId';
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    if (!isScopingWriteEnabled(req.user.id)) return next();

    if (isPrivileged(req.user.role)) return next();

    const subjectId = readField(req, source, field);
    if (!subjectId) {
      await audit(req, opts.action, 'subject', [], 'denied', `Missing ${source}.${field}`);
      return res.status(400).json({ message: `${field} ko'rsatilmagan` });
    }

    const ok = await canAccessSubject(req.user.id, subjectId);
    if (!ok) {
      await audit(req, opts.action, 'subject', [subjectId], 'denied', 'Subject not owned');
      return res.status(403).json({ message: 'Bu fan sizga biriktirilmagan' });
    }
    await audit(req, opts.action, 'subject', [subjectId], 'allowed');
    next();
  };
}

export function requireGroupSubject(opts: RequireOptions & { groupField?: string; subjectField?: string }) {
  const source = opts.source || 'body';
  const groupField = opts.groupField || 'groupId';
  const subjectField = opts.subjectField || 'subjectId';
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    if (!isScopingWriteEnabled(req.user.id)) return next();
    if (isPrivileged(req.user.role)) return next();

    const groupId = readField(req, source, groupField);
    const subjectId = readField(req, source, subjectField);

    if (!groupId || !subjectId) {
      await audit(req, opts.action, 'groupSubject', [groupId || '', subjectId || ''], 'denied', 'Missing ids');
      return res.status(400).json({ message: `${groupField} va ${subjectField} talab qilinadi` });
    }

    const ok = await canAccessGroupSubject(req.user.id, groupId, subjectId);
    if (!ok) {
      await audit(req, opts.action, 'groupSubject', [groupId, subjectId], 'denied', 'Not assigned');
      return res.status(403).json({ message: 'Bu guruh+fan sizga biriktirilmagan' });
    }
    await audit(req, opts.action, 'groupSubject', [groupId, subjectId], 'allowed');
    next();
  };
}

/**
 * For BlockTest: body.subjectTests is an array of { subjectId, ... } — verify every one.
 */
export function requireEverySubjectTest(opts: { action: string; arrayField?: string; subjectField?: string }) {
  const arrayField = opts.arrayField || 'subjectTests';
  const subjectField = opts.subjectField || 'subjectId';
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    if (!isScopingWriteEnabled(req.user.id)) return next();
    if (isPrivileged(req.user.role)) return next();

    const arr = (req.body as Record<string, unknown>)[arrayField];
    if (!Array.isArray(arr) || arr.length === 0) {
      // Let the route's validation handle the empty-array case; we don't block here.
      return next();
    }

    const subjectIds = arr
      .map(item => {
        if (item && typeof item === 'object') {
          const raw = (item as Record<string, unknown>)[subjectField];
          return typeof raw === 'string' ? raw : undefined;
        }
        return undefined;
      })
      .filter((x): x is string => !!x);

    for (const sid of subjectIds) {
      const ok = await canAccessSubject(req.user.id, sid);
      if (!ok) {
        await audit(req, opts.action, 'subject', [sid], 'denied', 'One of subjectTests not owned');
        return res.status(403).json({ message: `Fan sizga biriktirilmagan: ${sid}` });
      }
    }
    await audit(req, opts.action, 'subject', subjectIds, 'allowed');
    next();
  };
}
