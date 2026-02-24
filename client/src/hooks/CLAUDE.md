# hooks/ — Kontekst

## Vazifasi
Custom React hook'lar — API chaqiruvlar, permission tekshiruv, entity-spetsifik logikalar.

## Qoidalar
- Hook nomi: `use` prefiksi (`useApi`, `useTests`, `usePermissions`)
- API hook'lar: `useApiQuery` / `useApiMutation` (React Query wrapper) — `useApi.tsx` da
- Entity hook'lar: `useTests`, `useBlockTests`, `useStudents` — CRUD operatsiyalar uchun
- `usePermissions` — haqiqiy rol tekshiruvi: `isSuperAdmin`, `isFilAdmin`, `isAdmin`, `isTeacher`, `hasPermission()`, `hasRole()`
  - SUPER_ADMIN → barcha ruxsatlar; boshqalar → `user.permissions[]` tekshiriladi
- Yangi entity qo'shganda alohida `use[Entity].ts` hook yarat

## Namuna
```typescript
// Entity hook pattern (useTests.ts)
export function useTests(branchId?: string) {
  return useApiQuery<ITest[]>(
    ['tests', branchId],
    `/tests?branchId=${branchId}`,
    { enabled: !!branchId }
  );
}
```
