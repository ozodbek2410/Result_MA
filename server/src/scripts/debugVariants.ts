/**
 * Debug script to check variant texts in database
 * 
 * Usage: tsx src/scripts/debugVariants.ts <testId>
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Test from '../models/Test';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

async function debugVariants(testId: string) {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected\n');

    console.log(`📄 Loading test: ${testId}\n`);
    const test = await Test.findById(testId).lean();

    if (!test) {
      console.log('❌ Test not found');
      return;
    }

    console.log(`✅ Test found: ${test.name}`);
    console.log(`📊 Total questions: ${test.questions?.length || 0}\n`);

    // Check first 5 questions
    const questionsToCheck = test.questions?.slice(0, 5) || [];

    for (let i = 0; i < questionsToCheck.length; i++) {
      const q = questionsToCheck[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`QUESTION ${i + 1}:`);
      console.log(`${'='.repeat(60)}`);
      
      // Question text
      console.log('\n📝 Question Text:');
      console.log('  Type:', typeof q.text);
      if (typeof q.text === 'string') {
        try {
          const parsed = JSON.parse(q.text);
          console.log('  Format: JSON string');
          console.log('  Parsed:', JSON.stringify(parsed, null, 2).substring(0, 300));
        } catch {
          console.log('  Format: Plain string');
          console.log('  Value:', q.text.substring(0, 200));
        }
      } else {
        console.log('  Format: Object');
        console.log('  Value:', JSON.stringify(q.text, null, 2).substring(0, 300));
      }

      // Variants
      console.log('\n📋 Variants:');
      const variants = q.variants || [];
      
      if (variants.length === 0) {
        console.log('  ❌ NO VARIANTS FOUND!');
        continue;
      }

      for (let j = 0; j < variants.length; j++) {
        const v = variants[j];
        const letter = String.fromCharCode(65 + j);
        
        console.log(`\n  ${letter})`);
        console.log(`    Type: ${typeof v}`);
        
        if (typeof v === 'string') {
          console.log(`    Format: Plain string`);
          console.log(`    Value: "${v}"`);
          console.log(`    Length: ${(v as string).length}`);
          console.log(`    Empty: ${(v as string).trim().length === 0 ? 'YES ❌' : 'NO ✅'}`);
        } else if (v && typeof v === 'object') {
          console.log(`    Format: Object`);
          console.log(`    Has 'text' property: ${!!(v as any).text}`);
          console.log(`    Has 'letter' property: ${!!(v as any).letter}`);
          
          if ((v as any).text) {
            console.log(`    Text type: ${typeof (v as any).text}`);
            
            if (typeof v.text === 'string') {
              try {
                const parsed = JSON.parse(v.text);
                console.log(`    Text format: JSON string`);
                console.log(`    Parsed:`, JSON.stringify(parsed, null, 2).substring(0, 200));
              } catch {
                console.log(`    Text format: Plain string`);
                console.log(`    Text value: "${v.text}"`);
                console.log(`    Text length: ${v.text.length}`);
                console.log(`    Text empty: ${v.text.trim().length === 0 ? 'YES ❌' : 'NO ✅'}`);
              }
            } else {
              console.log(`    Text format: Object`);
              console.log(`    Text value:`, JSON.stringify(v.text, null, 2).substring(0, 200));
            }
          } else {
            console.log(`    ❌ NO TEXT PROPERTY!`);
          }
        } else {
          console.log(`    ❌ INVALID VARIANT FORMAT!`);
        }
      }

      // Correct answer
      console.log(`\n✓ Correct Answer: ${q.correctAnswer || 'NOT SET'}`);
    }

    console.log(`\n${'='.repeat(60)}\n`);
    console.log('✅ Debug complete');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Get testId from command line
const testId = process.argv[2];

if (!testId) {
  console.log('Usage: tsx src/scripts/debugVariants.ts <testId>');
  process.exit(1);
}

debugVariants(testId);
