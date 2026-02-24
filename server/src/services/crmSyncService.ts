import { logger } from '../config/logger';
import { CrmApiService, CrmStudent, CrmTeacher, CrmGroup, CrmSpecialty } from './crmApiService';
import Branch from '../models/Branch';
import Subject from '../models/Subject';
import Direction from '../models/Direction';
import User, { UserRole } from '../models/User';
import Group from '../models/Group';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import SyncLog, { ISyncResult } from '../models/SyncLog';
import { Types } from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

interface EntitySyncStats {
  created: number;
  updated: number;
  deactivated: number;
}

// Returns valid Date or undefined — prevents "Invalid Date" Mongoose error
function parseDate(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s || s === '0000-00-00' || s.toLowerCase() === 'null' || s.toLowerCase() === 'none' || s.toLowerCase() === 'undefined') return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

// Mutex to prevent concurrent syncs
let isSyncing = false;

class CrmSyncServiceClass {
  /**
   * Clean up stale "running" sync logs on startup
   */
  async cleanupStaleSyncs(): Promise<void> {
    const updated = await SyncLog.updateMany(
      { status: 'running' },
      { status: 'failed', completedAt: new Date(), error: 'Server restarted during sync' }
    );
    if (updated.modifiedCount > 0) {
      logger.info(`Cleaned up ${updated.modifiedCount} stale sync log(s)`, 'CRM_SYNC');
    }
  }

  /**
   * Run full CRM sync
   */
  async syncAll(triggeredBy?: string, type: 'manual' | 'scheduled' = 'scheduled'): Promise<ISyncResult> {
    if (isSyncing) {
      throw new Error('Sync already in progress');
    }

    if (!CrmApiService.isConfigured()) {
      throw new Error('CRM API not configured');
    }

    isSyncing = true;
    const startTime = Date.now();

    // Create sync log entry
    const syncLog = await SyncLog.create({
      type,
      status: 'running',
      startedAt: new Date(),
      triggeredBy: triggeredBy ? new Types.ObjectId(triggeredBy) : undefined,
    });

    const result: ISyncResult = {
      branches: { created: 0, updated: 0, deactivated: 0 },
      subjects: { created: 0, updated: 0 },
      directions: { created: 0, updated: 0 },
      teachers: { created: 0, updated: 0 },
      groups: { created: 0, updated: 0, deactivated: 0 },
      students: { created: 0, updated: 0, deactivated: 0 },
      duration: 0,
      syncErrors: [],
    };

    try {
      logger.info('CRM sync started', 'CRM_SYNC');

      // Step 1: Fetch all data from CRM
      logger.info('Fetching data from CRM...', 'CRM_SYNC');

      const [crmStudents, crmTeachers, crmSpecialties, crmGroups] = await Promise.all([
        CrmApiService.fetchAllStudents().catch(err => {
          result.syncErrors.push(`Students fetch error: ${err.message}`);
          return [] as CrmStudent[];
        }),
        CrmApiService.fetchAllTeachers().catch(err => {
          result.syncErrors.push(`Teachers fetch error: ${err.message}`);
          return [] as CrmTeacher[];
        }),
        CrmApiService.fetchAllSpecialties().catch(err => {
          result.syncErrors.push(`Specialties fetch error: ${err.message}`);
          return [] as CrmSpecialty[];
        }),
        CrmApiService.fetchAllGroups().catch(err => {
          result.syncErrors.push(`Groups fetch error: ${err.message}`);
          return [] as CrmGroup[];
        }),
      ]);

      logger.info(`Fetched: ${crmStudents.length} students, ${crmTeachers.length} teachers, ${crmSpecialties.length} specialties, ${crmGroups.length} groups`, 'CRM_SYNC');

      // Step 2: Sync in dependency order
      // 2a: Branches (from organizations embedded in students/teachers/groups)
      const orgsMap = this.extractOrganizations(crmStudents, crmTeachers, crmGroups);
      result.branches = await this.syncBranches(orgsMap);

      // 2b: Subjects (from teacher.subjects and specialty.subjects)
      const subjectsMap = this.extractSubjects(crmTeachers, crmSpecialties);
      result.subjects = await this.syncSubjects(subjectsMap);

      // 2c: Directions (specialties)
      result.directions = await this.syncDirections(crmSpecialties);

      // 2d: Teachers
      result.teachers = await this.syncTeachers(crmTeachers);

      // 2e: Groups
      result.groups = await this.syncGroups(crmGroups);

      // 2f: Students
      result.students = await this.syncStudents(crmStudents);

      result.duration = Date.now() - startTime;

      // Update sync log
      await SyncLog.findByIdAndUpdate(syncLog._id, {
        status: 'completed',
        result,
        completedAt: new Date(),
      });

      logger.info(`CRM sync completed in ${result.duration}ms`, 'CRM_SYNC');

      return result;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      result.syncErrors.push(`Fatal: ${errMsg}`);
      result.duration = Date.now() - startTime;

      await SyncLog.findByIdAndUpdate(syncLog._id, {
        status: 'failed',
        result,
        completedAt: new Date(),
        error: errMsg,
      });

      logger.error('CRM sync failed', error instanceof Error ? error : new Error(errMsg), 'CRM_SYNC');
      throw error;
    } finally {
      isSyncing = false;
    }
  }

  /**
   * Extract unique organizations from all CRM data
   */
  private extractOrganizations(
    students: CrmStudent[],
    teachers: CrmTeacher[],
    groups: CrmGroup[]
  ): Map<number, { name: string; address: string; phone: string }> {
    const orgs = new Map<number, { name: string; address: string; phone: string }>();

    for (const s of students) {
      if (s.organization) {
        orgs.set(s.organization.id, {
          name: s.organization.name,
          address: s.organization.address || '',
          phone: s.organization.phone || '',
        });
      }
    }
    for (const t of teachers) {
      if (t.organization) {
        orgs.set(t.organization.id, {
          name: t.organization.name,
          address: t.organization.address || '',
          phone: t.organization.phone || '',
        });
      }
    }
    for (const g of groups) {
      if (g.organization) {
        orgs.set(g.organization.id, {
          name: g.organization.name,
          address: g.organization.address || '',
          phone: g.organization.phone || '',
        });
      }
    }

    return orgs;
  }

  /**
   * Extract unique subjects from teachers and specialties
   */
  private extractSubjects(
    teachers: CrmTeacher[],
    specialties: CrmSpecialty[]
  ): Map<number, string> {
    const subjects = new Map<number, string>();

    for (const t of teachers) {
      for (const s of t.subjects) {
        subjects.set(s.id, s.name);
      }
      for (const g of t.groups) {
        if (g.subject) {
          subjects.set(g.subject.id, g.subject.name);
        }
      }
    }
    for (const sp of specialties) {
      for (const s of sp.subjects) {
        subjects.set(s.id, s.name);
      }
    }

    return subjects;
  }

  /**
   * Sync branches (organizations)
   */
  private async syncBranches(
    orgsMap: Map<number, { name: string; address: string; phone: string }>
  ): Promise<EntitySyncStats> {
    const stats: EntitySyncStats = { created: 0, updated: 0, deactivated: 0 };
    const now = new Date();
    const crmIds = new Set<number>();

    for (const [crmId, org] of orgsMap) {
      crmIds.add(crmId);
      const existing = await Branch.findOne({ crmId });

      if (existing) {
        await Branch.updateOne({ _id: existing._id }, {
          $set: {
            name: org.name,
            location: org.address || org.name,
            address: org.address,
            phone: org.phone,
            isActive: true,
            lastSyncedAt: now,
          },
        });
        stats.updated++;
      } else {
        await Branch.create({
          crmId,
          name: org.name,
          location: org.address || org.name,
          address: org.address,
          phone: org.phone,
          isActive: true,
          lastSyncedAt: now,
        });
        stats.created++;
      }
    }

    // Deactivate branches not in CRM
    if (crmIds.size > 0) {
      const deactivated = await Branch.updateMany(
        { crmId: { $exists: true, $nin: Array.from(crmIds) }, isActive: true },
        { $set: { isActive: false } }
      );
      stats.deactivated = deactivated.modifiedCount;
    }

    logger.info(`Branches: +${stats.created} ~${stats.updated} -${stats.deactivated}`, 'CRM_SYNC');
    return stats;
  }

  /**
   * Sync subjects
   */
  private async syncSubjects(
    subjectsMap: Map<number, string>
  ): Promise<{ created: number; updated: number }> {
    const stats = { created: 0, updated: 0 };
    const now = new Date();

    for (const [crmId, name] of subjectsMap) {
      const existing = await Subject.findOne({ crmId });

      if (existing) {
        if (existing.nameUzb !== name) {
          await Subject.updateOne({ _id: existing._id }, {
            $set: { nameUzb: name, lastSyncedAt: now, isActive: true },
          });
          stats.updated++;
        }
      } else {
        // Check by name first (might exist locally without crmId)
        const byName = await Subject.findOne({ nameUzb: name });
        if (byName) {
          await Subject.updateOne({ _id: byName._id }, {
            $set: { crmId, lastSyncedAt: now, isActive: true },
          });
          stats.updated++;
        } else {
          await Subject.create({
            crmId,
            nameUzb: name,
            isActive: true,
            lastSyncedAt: now,
          });
          stats.created++;
        }
      }
    }

    logger.info(`Subjects: +${stats.created} ~${stats.updated}`, 'CRM_SYNC');
    return stats;
  }

  /**
   * Sync directions (specialties)
   */
  private async syncDirections(
    specialties: CrmSpecialty[]
  ): Promise<{ created: number; updated: number }> {
    const stats = { created: 0, updated: 0 };
    const now = new Date();

    for (const sp of specialties) {
      const crmId = parseInt(String(sp.id), 10);

      // Resolve subject ObjectIds
      const subjectIds: Types.ObjectId[] = [];
      for (const s of sp.subjects) {
        const subject = await Subject.findOne({ crmId: s.id });
        if (subject) {
          subjectIds.push(subject._id as Types.ObjectId);
        }
      }

      const subjectsData = subjectIds.length > 0
        ? [{ type: 'single' as const, subjectIds }]
        : [];

      const existing = await Direction.findOne({ crmId });

      if (existing) {
        await Direction.updateOne({ _id: existing._id }, {
          $set: {
            nameUzb: sp.name,
            subjects: subjectsData,
            isActive: true,
            lastSyncedAt: now,
          },
        });
        stats.updated++;
      } else {
        await Direction.create({
          crmId,
          nameUzb: sp.name,
          subjects: subjectsData,
          isActive: true,
          lastSyncedAt: now,
        });
        stats.created++;
      }
    }

    logger.info(`Directions: +${stats.created} ~${stats.updated}`, 'CRM_SYNC');
    return stats;
  }

  /**
   * Sync teachers as User documents with role TEACHER
   */
  private async syncTeachers(
    teachers: CrmTeacher[]
  ): Promise<{ created: number; updated: number }> {
    const stats = { created: 0, updated: 0 };
    const now = new Date();

    for (const t of teachers) {
      // Resolve branch
      const branch = t.organization
        ? await Branch.findOne({ crmId: t.organization.id })
        : null;

      // Resolve subject ObjectIds
      const teacherSubjectIds: Types.ObjectId[] = [];
      for (const s of t.subjects) {
        const subject = await Subject.findOne({ crmId: s.id });
        if (subject) {
          teacherSubjectIds.push(subject._id as Types.ObjectId);
        }
      }

      const existing = await User.findOne({ crmId: t.id });

      if (existing) {
        const teacherUpdateData = Object.fromEntries(Object.entries({
          fullName: t.full_name,
          phone: t.phone || undefined,
          phone2: t.phone2 || undefined,
          birthDate: parseDate(t.birth_date),
          gender: t.gender,
          branchId: branch?._id,
          teacherSubjects: teacherSubjectIds,
          tgChatId: t.tg_chat_id || undefined,
          isActive: t.is_active,
          lastSyncedAt: now,
        }).filter(([, v]) => v !== undefined));
        await User.updateOne({ _id: existing._id }, { $set: teacherUpdateData });
        stats.updated++;
      } else {
        // Generate username from name
        const username = this.generateUsername(t.full_name, t.id);
        const hashedPassword = await bcrypt.hash('teacher123', 10);

        await User.create({
          crmId: t.id,
          username,
          password: hashedPassword,
          fullName: t.full_name,
          phone: t.phone || undefined,
          phone2: t.phone2 || undefined,
          birthDate: parseDate(t.birth_date),
          gender: t.gender,
          role: UserRole.TEACHER,
          branchId: branch?._id,
          teacherSubjects: teacherSubjectIds,
          tgChatId: t.tg_chat_id || undefined,
          isActive: t.is_active,
          lastSyncedAt: now,
        });
        stats.created++;
      }
    }

    logger.info(`Teachers: +${stats.created} ~${stats.updated}`, 'CRM_SYNC');
    return stats;
  }

  /**
   * Sync groups (classes)
   */
  private async syncGroups(
    groups: CrmGroup[]
  ): Promise<EntitySyncStats> {
    const stats: EntitySyncStats = { created: 0, updated: 0, deactivated: 0 };
    const now = new Date();
    const crmIds = new Set<number>();

    for (const g of groups) {
      crmIds.add(g.id);

      // Resolve branch
      const branch = g.organization
        ? await Branch.findOne({ crmId: g.organization.id })
        : null;

      if (!branch) {
        continue; // Skip groups without valid branch
      }

      // Resolve teacher
      const teacher = g.class_teacher
        ? await User.findOne({ crmId: g.class_teacher.id })
        : null;

      // Resolve direction (specialty)
      const direction = g.specialty
        ? await Direction.findOne({ crmId: parseInt(String(g.specialty.id), 10) })
        : null;

      const existing = await Group.findOne({ crmId: g.id });

      const groupData = {
        name: g.full_name || `${g.level}-${g.name}`,
        classNumber: g.level,
        letter: g.name,
        branchId: branch._id,
        teacherId: teacher?._id,
        directionId: direction?._id,
        pupilCount: g.pupil_count,
        educationYear: g.education_year?.name,
        isActive: true,
        lastSyncedAt: now,
      };

      if (existing) {
        await Group.updateOne({ _id: existing._id }, { $set: groupData });
        stats.updated++;
      } else {
        await Group.create({ crmId: g.id, ...groupData });
        stats.created++;
      }
    }

    // Deactivate groups not in CRM
    if (crmIds.size > 0) {
      const deactivated = await Group.updateMany(
        { crmId: { $exists: true, $nin: Array.from(crmIds) }, isActive: true },
        { $set: { isActive: false } }
      );
      stats.deactivated = deactivated.modifiedCount;
    }

    logger.info(`Groups: +${stats.created} ~${stats.updated} -${stats.deactivated}`, 'CRM_SYNC');
    return stats;
  }

  /**
   * Sync students
   */
  private async syncStudents(
    students: CrmStudent[]
  ): Promise<EntitySyncStats> {
    const stats: EntitySyncStats = { created: 0, updated: 0, deactivated: 0 };
    const now = new Date();
    const crmIds = new Set<number>();

    for (const s of students) {
      crmIds.add(s.id);

      // Resolve branch
      const branch = s.organization
        ? await Branch.findOne({ crmId: s.organization.id })
        : null;

      if (!branch) continue;

      // Resolve direction (specialty)
      const direction = s.specialty
        ? await Direction.findOne({ nameUzb: s.specialty.name })
        : null;

      // Resolve group
      const group = s.group
        ? await Group.findOne({ crmId: s.group.id })
        : null;

      const existing = await Student.findOne({ crmId: s.id });

      const studentData = {
        fullName: s.full_name,
        firstName: s.first_name,
        lastName: s.second_name,
        patronymic: s.third_name,
        birthDate: parseDate(s.birth_date),
        gender: s.gender,
        classNumber: s.group?.level || 1,
        phone: s.father_phone || undefined,
        motherPhone: s.mother_phone || undefined,
        branchId: branch._id,
        directionId: direction?._id,
        isActive: true,
        lastSyncedAt: now,
      };

      let studentDoc;

      if (existing) {
        // Remove undefined values to avoid overwriting existing fields with undefined
        const cleanData = Object.fromEntries(Object.entries(studentData).filter(([, v]) => v !== undefined));
        await Student.updateOne({ _id: existing._id }, { $set: cleanData });
        studentDoc = existing;
        stats.updated++;
      } else {
        const profileToken = crypto.randomBytes(16).toString('hex');
        studentDoc = await Student.create({
          crmId: s.id,
          profileToken,
          ...studentData,
        });
        stats.created++;
      }

      // Update StudentGroup junction
      if (group && studentDoc) {
        const studentId = studentDoc._id as Types.ObjectId;
        const groupId = group._id as Types.ObjectId;

        const existingJunction = await StudentGroup.findOne({ studentId, groupId });
        if (!existingJunction) {
          await StudentGroup.create({
            studentId,
            groupId,
            subjectId: group.subjectId || undefined,
          }).catch(() => {
            // Ignore duplicate key errors
          });
        }
      }
    }

    // Deactivate students not in CRM
    if (crmIds.size > 0) {
      const deactivated = await Student.updateMany(
        { crmId: { $exists: true, $nin: Array.from(crmIds) }, isActive: true },
        { $set: { isActive: false } }
      );
      stats.deactivated = deactivated.modifiedCount;
    }

    logger.info(`Students: +${stats.created} ~${stats.updated} -${stats.deactivated}`, 'CRM_SYNC');
    return stats;
  }

  /**
   * Generate unique username from full name
   */
  private generateUsername(fullName: string, crmId: number): string {
    const parts = fullName.toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}_${crmId}`;
    }
    return `teacher_${crmId}`;
  }

  /**
   * Check if sync is currently running
   */
  isSyncRunning(): boolean {
    return isSyncing;
  }

  /**
   * Get last sync log
   */
  async getLastSync() {
    return SyncLog.findOne().sort({ startedAt: -1 }).lean();
  }

  /**
   * Get sync logs with pagination
   */
  async getSyncLogs(page = 1, limit = 20) {
    const total = await SyncLog.countDocuments();
    const logs = await SyncLog
      .find()
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('triggeredBy', 'fullName username')
      .lean();

    return { logs, total, totalPages: Math.ceil(total / limit) };
  }
}

export const CrmSyncService = new CrmSyncServiceClass();

