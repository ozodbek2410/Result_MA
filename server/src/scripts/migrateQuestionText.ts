/**
 * Migration script: TipTap JSON string → plain text with \(...\) delimiters.
 *
 * DB da question.text va variant.text 3 xil formatda bo'lishi mumkin:
 * 1. "Oddiy matn"                    — o'zgarmaydi
 * 2. "Matn \\(x^2\\) bilan"          — o'zgarmaydi
 * 3. '{"type":"doc","content":[...]}' — plain text ga convert qilinadi
 *
 * Usage: npx tsx src/scripts/migrateQuestionText.ts [--dry-run]
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// TipTap JSON → plain text converter (server-side, latexUtils.ts dan ko'chirilgan)
function tiptapToText(json: unknown): string {
  if (!json) return '';
  if (typeof json === 'string') {
    try { json = JSON.parse(json); } catch { return json; }
  }
  if (typeof json !== 'object') return String(json);

  function processNode(node: Record<string, unknown>): string {
    if (!node) return '';
    if (node.type === 'text') return (node.text as string) || '';
    if (node.type === 'formula') {
      let latex = ((node.attrs as Record<string, string>)?.latex) || '';
      while (latex.startsWith('$$') && latex.endsWith('$$') && latex.length > 4) latex = latex.slice(2, -2).trim();
      while (latex.startsWith('$') && latex.endsWith('$') && latex.length > 2) latex = latex.slice(1, -1).trim();
      return `\\(${latex}\\)`;
    }
    if (node.type === 'paragraph') {
      return ((node.content as Record<string, unknown>[]) || []).map(processNode).join('');
    }
    if (node.type === 'doc') {
      return ((node.content as Record<string, unknown>[]) || []).map(processNode).join('\n');
    }
    if (node.content) {
      return (node.content as Record<string, unknown>[]).map(processNode).join('');
    }
    return '';
  }
  return processNode(json as Record<string, unknown>);
}

function isTiptapJson(text: string): boolean {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && (parsed.type === 'doc' || parsed.type === 'paragraph');
  } catch {
    return false;
  }
}

async function migrate() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Migration: TipTap JSON → Plain Text`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN (o\'zgartirish yo\'q)' : 'REAL (DB o\'zgaradi)'}`);
  console.log(`${'='.repeat(60)}\n`);

  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('MongoDB connected\n');

  const db = mongoose.connection.db!;
  let totalConverted = 0;
  let totalQuestions = 0;
  let totalVariants = 0;

  // BlockTests
  const blockTests = await db.collection('blocktests').find({}).toArray();
  console.log(`BlockTests: ${blockTests.length} ta topildi`);

  for (const bt of blockTests) {
    let modified = false;
    const subjectTests = bt.subjectTests || [];

    for (const st of subjectTests) {
      for (const q of st.questions || []) {
        // Question text
        if (isTiptapJson(q.text)) {
          const plain = tiptapToText(q.text);
          if (dryRun) {
            console.log(`  [DRY] BT ${bt._id} Q: "${q.text.substring(0, 50)}..." → "${plain.substring(0, 50)}..."`);
          }
          q.text = plain;
          modified = true;
          totalQuestions++;
          totalConverted++;
        }

        // Context text
        if (q.contextText && isTiptapJson(q.contextText)) {
          q.contextText = tiptapToText(q.contextText);
          modified = true;
          totalConverted++;
        }

        // Variant texts
        for (const v of q.variants || []) {
          if (isTiptapJson(v.text)) {
            const plain = tiptapToText(v.text);
            if (dryRun) {
              console.log(`  [DRY] BT ${bt._id} V: "${v.text.substring(0, 40)}..." → "${plain.substring(0, 40)}..."`);
            }
            v.text = plain;
            modified = true;
            totalVariants++;
            totalConverted++;
          }
        }
      }
    }

    if (modified && !dryRun) {
      await db.collection('blocktests').updateOne(
        { _id: bt._id },
        { $set: { subjectTests } }
      );
    }
  }

  // Tests (regular)
  const tests = await db.collection('tests').find({}).toArray();
  console.log(`Tests: ${tests.length} ta topildi`);

  for (const test of tests) {
    let modified = false;
    const questions = test.questions || [];

    for (const q of questions) {
      if (isTiptapJson(q.text)) {
        q.text = tiptapToText(q.text);
        modified = true;
        totalQuestions++;
        totalConverted++;
      }
      for (const v of q.variants || []) {
        if (isTiptapJson(v.text)) {
          v.text = tiptapToText(v.text);
          modified = true;
          totalVariants++;
          totalConverted++;
        }
      }
    }

    if (modified && !dryRun) {
      await db.collection('tests').updateOne(
        { _id: test._id },
        { $set: { questions } }
      );
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Natija:`);
  console.log(`    Jami convert qilingan: ${totalConverted}`);
  console.log(`    Savollar: ${totalQuestions}`);
  console.log(`    Variantlar: ${totalVariants}`);
  console.log(`    Rejim: ${dryRun ? 'DRY RUN' : 'REAL — DB o\'zgartirildi'}`);
  console.log(`${'='.repeat(60)}\n`);

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration xato:', err);
  process.exit(1);
});
