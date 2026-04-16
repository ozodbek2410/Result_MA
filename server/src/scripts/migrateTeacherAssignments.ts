/**
 * Migration: backfill TeacherGroupAssignment from existing Group.teacherId
 * and GroupSubjectConfig data.
 *
 * Usage:
 *   npx tsx src/scripts/migrateTeacherAssignments.ts --dry-run
 *   npx tsx src/scripts/migrateTeacherAssignments.ts --apply
 *   npx tsx src/scripts/migrateTeacherAssignments.ts --rollback
 *
 * Logic (idempotent):
 *   For every Group with teacherId set:
 *     For every GroupSubjectConfig (groupId matches):
 *       Upsert TeacherGroupAssignment(teacherId, groupId, subjectId)
 *         source=MIGRATION, isActive=true
 *     If no GroupSubjectConfig exists, fall back to teacher.teacherSubjects[]
 *       (every subject the teacher teaches × this group)
 *
 * Rollback: delete all assignments where source=MIGRATION. CRM_SYNC and MANUAL
 * entries are preserved.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import Group from '../models/Group';
import GroupSubjectConfig from '../models/GroupSubjectConfig';
import User, { UserRole } from '../models/User';
import TeacherGroupAssignment, { AssignmentSource } from '../models/TeacherGroupAssignment';

type Mode = 'dry-run' | 'apply' | 'rollback';

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) return 'apply';
  if (args.includes('--rollback')) return 'rollback';
  if (args.includes('--dry-run')) return 'dry-run';
  return 'dry-run';
}

interface Plan {
  toCreate: Array<{
    teacherId: mongoose.Types.ObjectId;
    groupId: mongoose.Types.ObjectId;
    subjectId: mongoose.Types.ObjectId;
    groupName: string;
    subjectName: string;
    teacherName: string;
  }>;
  skipped: { reason: string; groupName: string; detail?: string }[];
}

async function buildPlan(): Promise<Plan> {
  const plan: Plan = { toCreate: [], skipped: [] };

  const groups = await Group.find({ teacherId: { $exists: true, $ne: null } })
    .populate('teacherId', 'fullName teacherSubjects')
    .lean();

  for (const g of groups) {
    const teacher = g.teacherId as unknown as {
      _id: mongoose.Types.ObjectId;
      fullName?: string;
      teacherSubjects?: mongoose.Types.ObjectId[];
    };
    if (!teacher?._id) {
      plan.skipped.push({ reason: 'NO_TEACHER', groupName: g.name });
      continue;
    }

    const configs = await GroupSubjectConfig.find({ groupId: g._id })
      .populate('subjectId', 'nameUzb')
      .lean();

    if (configs.length > 0) {
      for (const c of configs) {
        const subject = c.subjectId as unknown as {
          _id: mongoose.Types.ObjectId;
          nameUzb?: string;
        };
        if (!subject?._id) continue;
        plan.toCreate.push({
          teacherId: teacher._id,
          groupId: g._id as mongoose.Types.ObjectId,
          subjectId: subject._id,
          groupName: g.name,
          subjectName: subject.nameUzb || 'unknown',
          teacherName: teacher.fullName || 'unknown',
        });
      }
    } else if (teacher.teacherSubjects && teacher.teacherSubjects.length > 0) {
      // Fallback: no per-subject config; use teacher's subject list
      for (const sid of teacher.teacherSubjects) {
        plan.toCreate.push({
          teacherId: teacher._id,
          groupId: g._id as mongoose.Types.ObjectId,
          subjectId: sid,
          groupName: g.name,
          subjectName: '(teacher.teacherSubjects fallback)',
          teacherName: teacher.fullName || 'unknown',
        });
      }
    } else {
      plan.skipped.push({
        reason: 'NO_CONFIG_NO_SUBJECTS',
        groupName: g.name,
        detail: teacher.fullName,
      });
    }
  }

  return plan;
}

async function applyPlan(plan: Plan): Promise<{ created: number; existed: number }> {
  let created = 0;
  let existed = 0;

  for (const item of plan.toCreate) {
    const result = await TeacherGroupAssignment.updateOne(
      { teacherId: item.teacherId, groupId: item.groupId, subjectId: item.subjectId },
      {
        $setOnInsert: {
          teacherId: item.teacherId,
          groupId: item.groupId,
          subjectId: item.subjectId,
          source: AssignmentSource.MIGRATION,
          isManualOverride: false,
          isActive: true,
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
    else existed++;
  }

  return { created, existed };
}

async function rollback(): Promise<number> {
  const result = await TeacherGroupAssignment.deleteMany({
    source: AssignmentSource.MIGRATION,
  });
  return result.deletedCount || 0;
}

async function main() {
  const mode = parseMode();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(`\n=== TeacherGroupAssignment migration — mode: ${mode} ===\n`);
  await mongoose.connect(uri);
  console.log('MongoDB connected');

  try {
    if (mode === 'rollback') {
      const deleted = await rollback();
      console.log(`\nRolled back ${deleted} migration-source assignments.`);
      console.log('CRM_SYNC and MANUAL entries preserved.');
      return;
    }

    const plan = await buildPlan();

    console.log(`\nTo create: ${plan.toCreate.length}`);
    console.log(`Skipped:   ${plan.skipped.length}`);

    if (plan.skipped.length > 0) {
      console.log('\n--- Skipped groups ---');
      for (const s of plan.skipped.slice(0, 20)) {
        console.log(`  [${s.reason}] ${s.groupName}${s.detail ? ` (${s.detail})` : ''}`);
      }
      if (plan.skipped.length > 20) {
        console.log(`  ... and ${plan.skipped.length - 20} more`);
      }
    }

    console.log('\n--- Sample of assignments to create (first 10) ---');
    for (const a of plan.toCreate.slice(0, 10)) {
      console.log(`  ${a.teacherName} -> ${a.groupName} / ${a.subjectName}`);
    }

    if (mode === 'dry-run') {
      console.log('\n[DRY RUN] No changes written. Re-run with --apply to persist.');
      return;
    }

    const { created, existed } = await applyPlan(plan);
    console.log(`\nCreated: ${created}`);
    console.log(`Already existed (skipped): ${existed}`);
    console.log(`\nDone. Verify with:`);
    console.log(`  db.teachergroupassignments.countDocuments({ source: 'MIGRATION' })`);
  } finally {
    await mongoose.disconnect();
    console.log('\nMongoDB disconnected.');
  }
}

main().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
