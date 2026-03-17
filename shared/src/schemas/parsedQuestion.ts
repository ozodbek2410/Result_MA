import { z } from 'zod';

// ============================================================
// DOCX Import Pipeline — Central Contract
// ============================================================
// Server DOIM shu formatda qaytaradi.
// Client DOIM shu formatni kutadi.
// Formulalar text ichida \(...\) delimiter bilan keladi.
// ============================================================

/** Savol varianti (A, B, C, D) */
export const ParsedVariantSchema = z.object({
  letter: z.enum(['A', 'B', 'C', 'D']),
  text: z.string(),
  formula: z.string().optional(),
  imageUrl: z.string().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
});

/** Savolga biriktirilgan media (rasm yoki jadval) */
export const MediaItemSchema = z.object({
  type: z.enum(['image', 'table']),
  url: z.string(),
  position: z.enum(['before', 'after', 'inline']),
});

/** Bitta parse qilingan savol */
export const ParsedQuestionSchema = z.object({
  // Savol matni — formulalar \(...\) ichida
  text: z.string(),
  // Kontekst (o'qish matni, rasmli kontekst)
  contextText: z.string().optional(),
  contextImage: z.string().optional(),
  contextImageWidth: z.number().optional(),
  contextImageHeight: z.number().optional(),
  // Alohida formula maydoni (legacy)
  formula: z.string().optional(),
  // Variantlar A-D
  variants: z.array(ParsedVariantSchema).max(4).default([]),
  // To'g'ri javob harfi yoki '' agar noma'lum
  correctAnswer: z.enum(['A', 'B', 'C', 'D', '']).default(''),
  // Ball
  points: z.number().default(1),
  // Tekshirish kerakmi
  needsReview: z.boolean().optional(),
  // Savol rasmi (legacy single image)
  imageUrl: z.string().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  // Yangi media format
  media: z.array(MediaItemSchema).optional(),
  // Shuffle dan himoyalangan
  pinned: z.boolean().optional(),
});

/** Savol guruhi (PDF multi-variant uchun) */
export const QuestionGroupSchema = z.object({
  startIndex: z.number(),
  endIndex: z.number(),
  questions: z.array(ParsedQuestionSchema),
});

/** Import endpoint javobi */
export const ImportResponseSchema = z.object({
  message: z.string(),
  questions: z.array(ParsedQuestionSchema),
  detectedType: z.string().default('generic'),
  count: z.number(),
  groups: z.array(QuestionGroupSchema).optional(),
  parserUsed: z.enum(['ai', 'regex', 'ai+regex']).optional(),
  logs: z.array(z.unknown()).optional(),
});

// ============================================================
// TypeScript tiplar (Zod dan export)
// ============================================================
export type ParsedVariant = z.infer<typeof ParsedVariantSchema>;
export type MediaItem = z.infer<typeof MediaItemSchema>;
export type ParsedQuestion = z.infer<typeof ParsedQuestionSchema>;
export type QuestionGroup = z.infer<typeof QuestionGroupSchema>;
export type ImportResponse = z.infer<typeof ImportResponseSchema>;
