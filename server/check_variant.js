const mongoose = require('mongoose');
require('dotenv').config();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/resultma';

mongoose.connect(MONGODB_URI).then(async () => {
  require('./dist/models/Student');
  const SV = require('./dist/models/StudentVariant').default;
  const Test = require('./dist/models/Test').default;

  const v = await SV.findOne({ variantCode: '33F64BDC' }).lean();
  if (!v) { console.log('NOT FOUND'); process.exit(0); }

  console.log('TestId:', v.testId);
  console.log('Total shuffled:', v.shuffledQuestions?.length);
  console.log('');

  // Load original test
  const test = await Test.findById(v.testId).lean();
  if (!test) { console.log('TEST NOT FOUND'); process.exit(0); }

  console.log('=== ORIGINAL TEST questions (first 10) ===');
  (test.questions || []).slice(0, 10).forEach((q, i) => {
    const vText = (q.variants || []).map(v => v.letter + ':' + (typeof v.text === 'string' ? v.text.substring(0, 25) : 'OBJ')).join(' | ');
    console.log('Q' + (i+1) + ': correct=' + q.correctAnswer + '  [' + vText + ']');
  });

  console.log('');
  console.log('=== SHUFFLED VARIANT questions (first 10) ===');
  (v.shuffledQuestions || []).slice(0, 10).forEach((q, i) => {
    const origIdx = q.originalQuestionIndex;
    const vText = (q.variants || []).map(v => v.letter + ':' + (typeof v.text === 'string' ? v.text.substring(0, 25) : 'OBJ')).join(' | ');
    console.log('Q' + (i+1) + ' (orig#' + origIdx + '): correct=' + q.correctAnswer + '  [' + vText + ']');

    // Verify: find original question and check if correct variant text matches
    if (origIdx !== undefined && test.questions[origIdx]) {
      const origQ = test.questions[origIdx];
      const origCorrectVariant = origQ.variants.find(v => v.letter === origQ.correctAnswer);
      const shuffCorrectVariant = q.variants.find(v => v.letter === q.correctAnswer);

      const origText = origCorrectVariant ? (typeof origCorrectVariant.text === 'string' ? origCorrectVariant.text.substring(0, 40) : JSON.stringify(origCorrectVariant.text).substring(0, 40)) : 'N/A';
      const shuffText = shuffCorrectVariant ? (typeof shuffCorrectVariant.text === 'string' ? shuffCorrectVariant.text.substring(0, 40) : JSON.stringify(shuffCorrectVariant.text).substring(0, 40)) : 'N/A';

      const match = origText === shuffText;
      console.log('   VERIFY: orig="' + origText + '" shuf="' + shuffText + '" MATCH=' + match);
    }
  });

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
