import { describe, it, expect } from 'vitest';
import {
  ParsedQuestionSchema,
  ParsedVariantSchema,
  MediaItemSchema,
  ImportResponseSchema,
} from '../schemas/parsedQuestion';

describe('ParsedVariantSchema', () => {
  it('valid variant passes', () => {
    const result = ParsedVariantSchema.safeParse({
      letter: 'A',
      text: '\\(x = 2\\)',
    });
    expect(result.success).toBe(true);
  });

  it('invalid letter rejects', () => {
    const result = ParsedVariantSchema.safeParse({
      letter: 'E',
      text: 'some text',
    });
    expect(result.success).toBe(false);
  });

  it('optional fields are allowed', () => {
    const result = ParsedVariantSchema.safeParse({
      letter: 'B',
      text: 'variant',
      imageUrl: '/uploads/test.png',
      imageWidth: 200,
      imageHeight: 100,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.imageUrl).toBe('/uploads/test.png');
    }
  });
});

describe('ParsedQuestionSchema', () => {
  it('minimal valid question passes', () => {
    const result = ParsedQuestionSchema.safeParse({
      text: 'Savolning matni',
      variants: [],
      correctAnswer: '',
      points: 1,
    });
    expect(result.success).toBe(true);
  });

  it('full question with formulas passes', () => {
    const result = ParsedQuestionSchema.safeParse({
      text: 'Tenglamani yeching: \\(x^2 - 4 = 0\\)',
      variants: [
        { letter: 'A', text: '\\(x = 2\\)' },
        { letter: 'B', text: '\\(x = -2\\)' },
        { letter: 'C', text: '\\(x = \\pm 2\\)' },
        { letter: 'D', text: 'Yechim yo\'q' },
      ],
      correctAnswer: 'C',
      points: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.variants).toHaveLength(4);
      expect(result.data.correctAnswer).toBe('C');
    }
  });

  it('question with media passes', () => {
    const result = ParsedQuestionSchema.safeParse({
      text: 'Rasmga qarang',
      variants: [{ letter: 'A', text: 'Ha' }, { letter: 'B', text: 'Yo\'q' }],
      correctAnswer: 'A',
      points: 2,
      imageUrl: '/uploads/test-images/abc.png',
      imageWidth: 300,
      imageHeight: 200,
      media: [{ type: 'table', url: '/uploads/table.png', position: 'after' }],
    });
    expect(result.success).toBe(true);
  });

  it('invalid correctAnswer rejects', () => {
    const result = ParsedQuestionSchema.safeParse({
      text: 'Savol',
      variants: [],
      correctAnswer: 'E', // Invalid
      points: 1,
    });
    expect(result.success).toBe(false);
  });

  it('more than 4 variants rejects', () => {
    const result = ParsedQuestionSchema.safeParse({
      text: 'Savol',
      variants: [
        { letter: 'A', text: '1' },
        { letter: 'B', text: '2' },
        { letter: 'C', text: '3' },
        { letter: 'D', text: '4' },
        { letter: 'A', text: '5' }, // 5th variant
      ],
      correctAnswer: '',
      points: 1,
    });
    expect(result.success).toBe(false);
  });

  it('defaults correctAnswer to empty string', () => {
    const result = ParsedQuestionSchema.safeParse({
      text: 'Savol',
      variants: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.correctAnswer).toBe('');
      expect(result.data.points).toBe(1);
    }
  });
});

describe('MediaItemSchema', () => {
  it('valid image media passes', () => {
    const result = MediaItemSchema.safeParse({
      type: 'image',
      url: '/uploads/test-images/abc.png',
      position: 'before',
    });
    expect(result.success).toBe(true);
  });

  it('valid table media passes', () => {
    const result = MediaItemSchema.safeParse({
      type: 'table',
      url: '/uploads/test-images/table1.png',
      position: 'after',
    });
    expect(result.success).toBe(true);
  });

  it('invalid type rejects', () => {
    const result = MediaItemSchema.safeParse({
      type: 'video',
      url: '/uploads/video.mp4',
      position: 'inline',
    });
    expect(result.success).toBe(false);
  });
});

describe('ImportResponseSchema', () => {
  it('valid response passes', () => {
    const result = ImportResponseSchema.safeParse({
      message: '5 ta savol topildi (ai parser)',
      questions: [
        {
          text: 'Savol 1',
          variants: [
            { letter: 'A', text: 'A variant' },
            { letter: 'B', text: 'B variant' },
          ],
          correctAnswer: 'A',
          points: 1,
        },
      ],
      detectedType: 'math',
      count: 1,
      parserUsed: 'ai',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parserUsed).toBe('ai');
    }
  });

  it('response with groups passes', () => {
    const q = {
      text: 'Savol',
      variants: [],
      correctAnswer: '' as const,
      points: 1,
    };
    const result = ImportResponseSchema.safeParse({
      message: 'OK',
      questions: [q],
      detectedType: 'generic',
      count: 1,
      groups: [{
        startIndex: 0,
        endIndex: 0,
        questions: [q],
      }],
    });
    expect(result.success).toBe(true);
  });
});
