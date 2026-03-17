import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock GroqService BEFORE importing AiParser
vi.mock('../../groqService', () => ({
  GroqService: {
    parseStructured: vi.fn(),
  },
}));

import { parseWithAi } from '../AiParser';
import { GroqService } from '../../groqService';

const mockedParseStructured = vi.mocked(GroqService.parseStructured);

describe('AiParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses math questions from AI response', async () => {
    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'math',
      questions: [
        {
          number: 1,
          text: 'Tenglamani yeching: \\(x^2 - 9 = 0\\)',
          variants: {
            A: '\\(x = 3\\)',
            B: '\\(x = -3\\)',
            C: '\\(x = \\pm 3\\)',
            D: 'Yechim yo\'q',
          },
          correctAnswer: 'C',
        },
        {
          number: 2,
          text: '2 + 2 = ?',
          variants: { A: '3', B: '4', C: '5', D: '6' },
          correctAnswer: 'B',
        },
      ],
    });

    const result = await parseWithAi(
      'some raw text',
      new Map(),
      new Map()
    );

    expect(result.questions).toHaveLength(2);
    expect(result.detectedSubject).toBe('math');
    expect(result.questions[0].text).toContain('\\(x^2 - 9 = 0\\)');
    expect(result.questions[0].correctAnswer).toBe('C');
    expect(result.questions[0].variants).toHaveLength(4);
    expect(result.questions[1].correctAnswer).toBe('B');
  });

  it('parses chemistry questions', async () => {
    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'chemistry',
      questions: [
        {
          number: 1,
          text: '\\(H_2SO_4\\) ning nomi nima?',
          variants: {
            A: 'Sulfat kislota',
            B: 'Oltingugurt kislota',
            C: 'Xlorid kislota',
            D: 'Nitrat kislota',
          },
          correctAnswer: 'B',
        },
      ],
    });

    const result = await parseWithAi('chemistry text', new Map(), new Map());

    expect(result.questions).toHaveLength(1);
    expect(result.detectedSubject).toBe('chemistry');
    expect(result.questions[0].text).toContain('\\(H_2SO_4\\)');
    expect(result.questions[0].correctAnswer).toBe('B');
  });

  it('handles AI returning null (API failure)', async () => {
    mockedParseStructured.mockResolvedValue(null);

    const result = await parseWithAi('some text', new Map(), new Map());
    expect(result.questions).toHaveLength(0);
    expect(result.detectedSubject).toBe('generic');
  });

  it('handles AI throwing error', async () => {
    mockedParseStructured.mockRejectedValue(new Error('Groq API timeout'));

    const result = await parseWithAi('some text', new Map(), new Map());
    expect(result.questions).toHaveLength(0);
  });

  it('handles AI returning invalid questions (no text)', async () => {
    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'math',
      questions: [
        { number: 1, text: '', variants: {}, correctAnswer: '' },
        { number: 2, text: 'Valid question', variants: { A: 'a', B: 'b' }, correctAnswer: '' },
      ],
    });

    const result = await parseWithAi('text', new Map(), new Map());
    // Empty text question should be skipped
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].text).toBe('Valid question');
  });

  it('removes \\text{} wrapper from AI output', async () => {
    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'math',
      questions: [
        {
          number: 1,
          text: '\\text{Tenglamani yeching}',
          variants: {
            A: '\\text{Javob A}',
            B: 'Javob B',
          },
          correctAnswer: 'A',
        },
      ],
    });

    const result = await parseWithAi('text', new Map(), new Map());
    expect(result.questions[0].text).toBe('Tenglamani yeching');
    expect(result.questions[0].variants[0].text).toBe('Javob A');
  });

  it('attaches images by ___IMAGE_N___ marker', async () => {
    const images = new Map([['image1.png', '/uploads/test-images/abc.png']]);
    const dims = new Map([['1', { widthPx: 300, heightPx: 200 }]]);

    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'biology',
      questions: [
        {
          number: 1,
          text: 'Rasmga qarang ___IMAGE_1___. Nima ko\'rsatilgan?',
          variants: { A: 'Hujayra', B: 'Atom', C: 'Molekula', D: 'Virus' },
          correctAnswer: 'A',
        },
      ],
    });

    const result = await parseWithAi('text', images, dims);
    expect(result.questions[0].imageUrl).toBe('/uploads/test-images/abc.png');
    expect(result.questions[0].imageWidth).toBe(300);
    expect(result.questions[0].imageHeight).toBe(200);
    // Image marker should be removed from text
    expect(result.questions[0].text).not.toContain('___IMAGE_');
  });

  it('marks questions with < 4 variants as needsReview', async () => {
    mockedParseStructured.mockResolvedValue({
      questions: [
        {
          number: 1,
          text: 'Savol',
          variants: { A: 'Ha', B: 'Yo\'q' },
          correctAnswer: '',
        },
      ],
    });

    const result = await parseWithAi('text', new Map(), new Map());
    expect(result.questions[0].needsReview).toBe(true);
  });

  it('handles empty text', async () => {
    const result = await parseWithAi('', new Map(), new Map());
    expect(result.questions).toHaveLength(0);
    expect(mockedParseStructured).not.toHaveBeenCalled();
  });

  it('handles AI returning no questions array', async () => {
    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'math',
      // no questions field
    });

    const result = await parseWithAi('text', new Map(), new Map());
    expect(result.questions).toHaveLength(0);
  });

  it('ignores invalid correctAnswer values', async () => {
    mockedParseStructured.mockResolvedValue({
      questions: [
        {
          number: 1,
          text: 'Savol',
          variants: { A: 'a', B: 'b', C: 'c', D: 'd' },
          correctAnswer: 'E', // invalid
        },
      ],
    });

    const result = await parseWithAi('text', new Map(), new Map());
    expect(result.questions[0].correctAnswer).toBe('');
  });

  it('handles 30-question math test', async () => {
    const questions = Array.from({ length: 30 }, (_, i) => ({
      number: i + 1,
      text: `Savol ${i + 1}: \\(${i + 1}x = ${(i + 1) * 2}\\)`,
      variants: {
        A: `\\(x = ${i}\\)`,
        B: `\\(x = ${i + 1}\\)`,
        C: `\\(x = ${i + 2}\\)`,
        D: `\\(x = ${i + 3}\\)`,
      },
      correctAnswer: 'B',
    }));

    mockedParseStructured.mockResolvedValue({
      detectedSubject: 'math',
      questions,
    });

    const result = await parseWithAi('big text', new Map(), new Map());
    expect(result.questions).toHaveLength(30);
    expect(result.questions.every(q => q.correctAnswer === 'B')).toBe(true);
    expect(result.questions.every(q => q.variants.length === 4)).toBe(true);
  });
});
