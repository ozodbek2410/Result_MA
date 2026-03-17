import { describe, it, expect } from 'vitest';
import { parseWithRegex } from '../RegexFallbackParser';

describe('RegexFallbackParser', () => {
  describe('standard format parsing', () => {
    it('parses numbered questions with A-D variants', () => {
      const text = `1) Tenglamani yeching \\(x^2 = 4\\)
A) \\(x = 2\\)
B) \\(x = -2\\)
C) \\(x = \\pm 2\\)
D) Yechim yo'q

2) 2 + 2 = ?
A) 3
B) 4
C) 5
D) 6`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(2);
      expect(result[0].text).toContain('Tenglamani yeching');
      expect(result[0].text).toContain('\\(x^2 = 4\\)');
      expect(result[0].variants).toHaveLength(4);
      expect(result[0].variants[0].letter).toBe('A');
      expect(result[0].variants[0].text).toContain('\\(x = 2\\)');
    });

    it('detects bold correct answer', () => {
      const text = `1) Savol matni
A) Noto'g'ri
**B) To'g'ri javob**
C) Noto'g'ri
D) Noto'g'ri`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(1);
      expect(result[0].correctAnswer).toBe('B');
    });

    it('handles dot-numbered questions (1. format)', () => {
      const text = `1. Birinchi savol
A) Javob 1
B) Javob 2
C) Javob 3
D) Javob 4

2. Ikkinchi savol
A) Ha
B) Yo'q
C) Bilmayman
D) Barchasi`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(2);
    });
  });

  describe('inline variants', () => {
    it('parses inline A) B) C) D) on same line', () => {
      const text = `1) Savol matni A) birinchi B) ikkinchi C) uchinchi D) to'rtinchi`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(1);
      expect(result[0].variants.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('math preservation', () => {
    it('preserves \\(...\\) math blocks', () => {
      const text = `1) \\(\\frac{1}{2} + \\frac{1}{3}\\) ning qiymati
A) \\(\\frac{5}{6}\\)
B) \\(\\frac{2}{5}\\)
C) \\(\\frac{1}{6}\\)
D) 1`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('\\(\\frac{1}{2}');
      expect(result[0].variants[0].text).toContain('\\(\\frac{5}{6}\\)');
    });

    it('preserves \\[...\\] display math', () => {
      const text = `1) Formulani hisoblang: \\[E = mc^2\\]
A) To'g'ri
B) Noto'g'ri
C) Bilmayman
D) Barchasi`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(1);
      expect(result[0].text).toContain('\\[E = mc^2\\]');
    });
  });

  describe('Cyrillic handling', () => {
    it('converts Cyrillic A/B/C/D to Latin', () => {
      const text = `1) Savol
А) Birinchi
В) Ikkinchi
С) Uchinchi
Д) To'rtinchi`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(1);
      // Cyrillic А → Latin A
      expect(result[0].variants.some(v => v.letter === 'A')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty text', () => {
      expect(parseWithRegex('')).toEqual([]);
      expect(parseWithRegex('   ')).toEqual([]);
    });

    it('returns empty array for text without questions', () => {
      const text = 'Bu oddiy matn, savol yo\'q.';
      expect(parseWithRegex(text)).toEqual([]);
    });

    it('marks questions with < 4 variants as needsReview', () => {
      const text = `1) Savol
A) Ha
B) Yo'q`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(1);
      expect(result[0].needsReview).toBe(true);
    });

    it('handles sequential numbering (skips non-sequential)', () => {
      const text = `1) Birinchi savol
A) a B) b C) c D) d

2) Ikkinchi savol
A) a B) b C) c D) d

3) Uchinchi savol
A) a B) b C) c D) d`;

      const result = parseWithRegex(text);
      expect(result).toHaveLength(3);
    });
  });
});
