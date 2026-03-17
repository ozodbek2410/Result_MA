import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../TextExtractor', () => ({
  extractFromDocx: vi.fn(),
}));

vi.mock('../AiParser', () => ({
  parseWithAi: vi.fn(),
}));

vi.mock('../RegexFallbackParser', () => ({
  parseWithRegex: vi.fn(),
}));

vi.mock('../../groqService', () => ({
  GroqService: {
    getAndClearLogs: vi.fn().mockReturnValue([]),
  },
}));

import { ImportOrchestrator } from '../ImportOrchestrator';
import { extractFromDocx } from '../TextExtractor';
import { parseWithAi } from '../AiParser';
import { parseWithRegex } from '../RegexFallbackParser';

const mockedExtract = vi.mocked(extractFromDocx);
const mockedAiParse = vi.mocked(parseWithAi);
const mockedRegexParse = vi.mocked(parseWithRegex);

const sampleContent = {
  rawText: '1) Savol\nA) a\nB) b\nC) c\nD) d',
  images: new Map<string, string>(),
  imageDimensions: new Map<string, { widthPx: number; heightPx: number }>(),
  tables: new Map<string, string>(),
  formulas: new Map<string, string>(),
};

const sampleQuestion = {
  text: 'Savol matni',
  variants: [
    { letter: 'A' as const, text: 'a' },
    { letter: 'B' as const, text: 'b' },
    { letter: 'C' as const, text: 'c' },
    { letter: 'D' as const, text: 'd' },
  ],
  correctAnswer: 'A' as const,
  points: 1,
};

describe('ImportOrchestrator', () => {
  let orchestrator: ImportOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new ImportOrchestrator();
    mockedExtract.mockResolvedValue(sampleContent);
  });

  it('uses AI parser when successful', async () => {
    mockedAiParse.mockResolvedValue({
      questions: [sampleQuestion],
      detectedSubject: 'math',
    });

    const result = await orchestrator.parseDocx('/test.docx');

    expect(result.count).toBe(1);
    expect(result.parserUsed).toBe('ai');
    expect(result.detectedType).toBe('math');
    expect(result.questions[0].text).toBe('Savol matni');
  });

  it('falls back to regex when AI returns 0 questions', async () => {
    mockedAiParse.mockResolvedValue({
      questions: [],
      detectedSubject: 'generic',
    });
    mockedRegexParse.mockReturnValue([sampleQuestion]);

    const result = await orchestrator.parseDocx('/test.docx');

    expect(result.count).toBe(1);
    expect(result.parserUsed).toBe('regex');
    expect(mockedRegexParse).toHaveBeenCalled();
  });

  it('falls back to regex when AI throws error', async () => {
    mockedAiParse.mockRejectedValue(new Error('API timeout'));
    mockedRegexParse.mockReturnValue([sampleQuestion]);

    const result = await orchestrator.parseDocx('/test.docx');

    expect(result.count).toBe(1);
    expect(result.parserUsed).toBe('regex');
  });

  it('returns empty when both parsers fail', async () => {
    mockedAiParse.mockResolvedValue({
      questions: [],
      detectedSubject: 'generic',
    });
    mockedRegexParse.mockReturnValue([]);

    const result = await orchestrator.parseDocx('/test.docx');

    expect(result.count).toBe(0);
    expect(result.message).toContain('topilmadi');
  });

  it('returns error when extraction fails', async () => {
    mockedExtract.mockRejectedValue(new Error('File not found'));

    const result = await orchestrator.parseDocx('/missing.docx');

    expect(result.count).toBe(0);
    expect(result.message).toContain('xato');
  });

  it('returns error when rawText is empty', async () => {
    mockedExtract.mockResolvedValue({ ...sampleContent, rawText: '' });

    const result = await orchestrator.parseDocx('/empty.docx');

    expect(result.count).toBe(0);
    expect(result.message).toContain('topilmadi');
  });

  it('replaces OLE formula images with LaTeX', async () => {
    const contentWithFormulas = {
      ...sampleContent,
      formulas: new Map([['3', 'x^2 + y^2']]),
    };
    mockedExtract.mockResolvedValue(contentWithFormulas);

    mockedAiParse.mockResolvedValue({
      questions: [{
        ...sampleQuestion,
        text: 'Formulaga qarang: ___IMAGE_3___',
      }],
      detectedSubject: 'math',
    });

    const result = await orchestrator.parseDocx('/test.docx');
    expect(result.questions[0].text).toContain('\\(x^2 + y^2\\)');
    expect(result.questions[0].text).not.toContain('___IMAGE_');
  });

  it('attaches remaining images to questions', async () => {
    const contentWithImages = {
      ...sampleContent,
      images: new Map([['image5.png', '/uploads/test-images/abc.png']]),
      imageDimensions: new Map([['5', { widthPx: 400, heightPx: 300 }]]),
    };
    mockedExtract.mockResolvedValue(contentWithImages);

    mockedAiParse.mockResolvedValue({
      questions: [{
        ...sampleQuestion,
        text: 'Rasmga qarang ___IMAGE_5___',
      }],
      detectedSubject: 'biology',
    });

    const result = await orchestrator.parseDocx('/test.docx');
    expect(result.questions[0].imageUrl).toBe('/uploads/test-images/abc.png');
    expect(result.questions[0].imageWidth).toBe(400);
    expect(result.questions[0].text).not.toContain('___IMAGE_');
  });

  it('attaches tables as media items', async () => {
    const contentWithTables = {
      ...sampleContent,
      tables: new Map([['table1', '/uploads/test-images/table1.png']]),
    };
    mockedExtract.mockResolvedValue(contentWithTables);

    mockedAiParse.mockResolvedValue({
      questions: [{
        ...sampleQuestion,
        text: 'Jadvalga qarang ___TABLE_1___',
      }],
      detectedSubject: 'generic',
    });

    const result = await orchestrator.parseDocx('/test.docx');
    expect(result.questions[0].media).toHaveLength(1);
    expect(result.questions[0].media![0].type).toBe('table');
    expect(result.questions[0].media![0].url).toBe('/uploads/test-images/table1.png');
    expect(result.questions[0].text).not.toContain('___TABLE_');
  });
});
