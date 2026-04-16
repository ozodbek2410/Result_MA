# Teacher-Group-Subject Scoping

## What this enables
- Every teacher sees only the (group, subject) pairs they actually teach.
- Creating a test / block test requires ownership of `subjectId` (and every `subjectTests[i].subjectId`).
- CRM sync auto-populates `TeacherGroupAssignment` from `teacher.groups[]`.
- Manual overrides (set by admins) survive CRM sync.
- 403 decisions are written to `PermissionAuditLog` for monitoring.

## Data model
`TeacherGroupAssignment`
- `teacherId`, `groupId`, `subjectId` (unique triple)
- `source`: `CRM_SYNC | MANUAL | MIGRATION`
- `isManualOverride` — true means sync never touches this row
- `isActive`, `deactivatedAt`, `deactivatedReason`

`PermissionAuditLog` — 90-day TTL

## Feature flags (`server/.env`)
```
TEACHER_SCOPING_READ=false
TEACHER_SCOPING_WRITE=false
TEACHER_SCOPING_TEACHER_IDS=
```
- `READ` — teacher-facing UI uses `TeacherGroupAssignment`
- `WRITE` — server enforces ownership on test/blockTest create
- `TEACHER_IDS` — comma-separated User `_id`s to gate rollout; empty = all teachers

## Rollout plan

### Phase 0 — pre-deploy
- [ ] Take a MongoDB backup (`mongodump`)
- [ ] Confirm `.env` on VPS has new flags set to `false`
- [ ] Deploy code: `git pull && cd server && npx tsc && cd ../client && npm run build && pm2 restart resultma-server resultma-worker`
- [ ] Verify: login still works, tests still create, teacher dashboard still loads

### Phase 1 — migration (writes data, changes no behavior)
- [ ] `cd server && npm run migrate-teacher-assignments -- --dry-run` — inspect output
- [ ] `cd server && npm run migrate-teacher-assignments -- --apply`
- [ ] Spot-check: `db.teachergroupassignments.countDocuments({ source: 'MIGRATION' })`

### Phase 2 — CRM sync refresh
- [ ] Trigger manual sync from admin UI or `POST /api/crm/sync`
- [ ] Check `SyncLog.result.assignments` — non-zero `created`
- [ ] Watch logs for `empty-groups protected: N` warnings — any non-zero deserves investigation

### Phase 3 — enable READ for one test teacher
- [ ] Put one teacher's `User._id` in `TEACHER_SCOPING_TEACHER_IDS`
- [ ] Set `TEACHER_SCOPING_READ=true`, keep `WRITE=false`
- [ ] Restart: `pm2 restart resultma-server resultma-worker`
- [ ] Log in as test teacher, verify `/teacher/groups` shows correct per-subject rows
- [ ] Verify other teachers are unaffected

### Phase 4 — enable WRITE for one test teacher
- [ ] Same `TEACHER_SCOPING_TEACHER_IDS`, set `TEACHER_SCOPING_WRITE=true`
- [ ] Test teacher tries to create a test for a subject they don't teach → expect 403
- [ ] Test teacher creates a test for their own subject → expect 201
- [ ] Inspect `/api/admin/permission-audit?outcome=denied` for 24h

### Phase 5 — expand to one branch
- [ ] Add every teacher in that branch to `TEACHER_SCOPING_TEACHER_IDS`
- [ ] Monitor 403 rate for 1–2 days

### Phase 6 — all teachers
- [ ] Empty `TEACHER_SCOPING_TEACHER_IDS` (= all)
- [ ] Monitor for a week, keep rollback path warm

## Rollback
At any phase:
- Set flag(s) to `false`, `pm2 restart resultma-server resultma-worker`
- Data in `TeacherGroupAssignment` remains but is no longer consulted
- Migration rollback: `npm run migrate-teacher-assignments -- --rollback` — removes `MIGRATION`-source rows only; CRM and MANUAL entries are preserved

## Password policy
- New CRM-synced teachers are created with `mustChangePassword: true`
- First login forces `/change-password` (React Router gate)
- Policy: min 8 chars, 1 uppercase, 1 digit, must differ from current
- Admin reset: `POST /api/auth/admin/reset-password` — sets `mustChangePassword: true`

## Endpoints added
- `GET  /api/me/groups` — teacher's groups (per-subject, unioned with legacy)
- `GET  /api/me/students` — students across those groups
- `GET  /api/me/tests` — tests this teacher created
- `GET  /api/admin/teacher-assignments` — list (filters: teacherId, groupId, subjectId, activeOnly)
- `POST /api/admin/teacher-assignments` — manual override create
- `PATCH /api/admin/teacher-assignments/:id` — toggle isActive / isManualOverride
- `GET  /api/admin/permission-audit` — denied/allowed log with top-20 aggregate
- `POST /api/auth/change-password` — user-initiated
- `POST /api/auth/admin/reset-password` — admin reset

## Verification checklist post-deploy
- `npx tsc --noEmit` clean
- `npm test` green (passwordPolicy, featureFlags, crmApiService.normalize)
- Existing teacher can still see groups pre-flag
- Admin opens `/teacher/admin/teacher-assignments` without error
- CRM sync completes with non-empty `SyncLog.result.assignments`
