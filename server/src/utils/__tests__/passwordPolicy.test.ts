import { describe, it, expect } from 'vitest';
import { validatePassword, MIN_PASSWORD_LENGTH } from '../passwordPolicy';

describe('validatePassword', () => {
  it('rejects non-string input', () => {
    expect(validatePassword(undefined)).toMatch(/belgidan/);
    expect(validatePassword(null)).toMatch(/belgidan/);
    expect(validatePassword(123)).toMatch(/belgidan/);
  });

  it(`rejects shorter than ${MIN_PASSWORD_LENGTH}`, () => {
    expect(validatePassword('A1short')).toMatch(/belgidan/);
  });

  it('requires an uppercase letter', () => {
    expect(validatePassword('abcdefg1')).toMatch(/katta harf/);
  });

  it('requires a digit', () => {
    expect(validatePassword('Abcdefgh')).toMatch(/raqam/);
  });

  it('accepts a strong password', () => {
    expect(validatePassword('Secure123')).toBeNull();
  });

  it('accepts long passwords with special chars', () => {
    expect(validatePassword('V3ryL0ngPass!Word')).toBeNull();
  });
});
