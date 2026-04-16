import { describe, it, expect } from 'vitest';
import { normalizeTeacherGroups, CrmTeacher } from '../crmApiService';

function makeTeacher(groups: CrmTeacher['groups']): CrmTeacher {
  return {
    id: 1,
    full_name: 'Test Teacher',
    first_name: 'Test',
    second_name: '',
    third_name: '',
    phone: null,
    phone2: null,
    birth_date: null,
    gender: 'male',
    is_active: true,
    tg_chat_id: null,
    organization: null,
    subjects: [],
    groups,
  };
}

describe('normalizeTeacherGroups', () => {
  it('prefers full_name over group_name and name', () => {
    const t = makeTeacher([
      { id: 10, full_name: 'Full 10', group_name: 'GN 10', name: 'N 10', subject: { id: 5, name: 'Math' } },
    ]);
    const links = normalizeTeacherGroups(t);
    expect(links).toHaveLength(1);
    expect(links[0].groupLabel).toBe('Full 10');
    expect(links[0].crmGroupId).toBe(10);
    expect(links[0].subjectCrmId).toBe(5);
  });

  it('falls back to group_name when full_name missing', () => {
    const t = makeTeacher([
      { id: 11, group_name: 'GN 11', subject: { id: 6, name: 'Bio' } },
    ]);
    expect(normalizeTeacherGroups(t)[0].groupLabel).toBe('GN 11');
  });

  it('falls back to name when full_name and group_name missing', () => {
    const t = makeTeacher([
      { id: 12, name: 'Plain 12', subject: { id: 7, name: 'Phys' } },
    ]);
    expect(normalizeTeacherGroups(t)[0].groupLabel).toBe('Plain 12');
  });

  it('falls back to level and finally to #id', () => {
    const t1 = makeTeacher([{ id: 13, level: '7', subject: { id: 8, name: 'Chem' } }]);
    expect(normalizeTeacherGroups(t1)[0].groupLabel).toBe('7');
    const t2 = makeTeacher([{ id: 14, subject: { id: 9, name: 'Lit' } }]);
    expect(normalizeTeacherGroups(t2)[0].groupLabel).toBe('#14');
  });

  it('skips entries without numeric id', () => {
    const t = makeTeacher([
      // @ts-expect-error intentional bad data
      { id: 'bad', name: 'Skip' },
      { id: 15, name: 'Keep', subject: { id: 1, name: 's' } },
    ]);
    const links = normalizeTeacherGroups(t);
    expect(links).toHaveLength(1);
    expect(links[0].crmGroupId).toBe(15);
  });

  it('handles empty or missing groups safely', () => {
    const t = makeTeacher([]);
    expect(normalizeTeacherGroups(t)).toEqual([]);
    const t2 = { ...makeTeacher([]), groups: undefined as unknown as CrmTeacher['groups'] };
    expect(normalizeTeacherGroups(t2)).toEqual([]);
  });
});
