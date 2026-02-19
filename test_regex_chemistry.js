// Test regex for chemistry formulas

const text1 = "X_3(PO_4)_2 ning molyar massasi 454 g/mol";
const text2 = ". X_3(PO_4)_2 ning molyar massasi 454 g/mol bo'lsa";

// Old regex (broken)
const oldPattern = /([A-Z][a-z]?_\d+\([A-Z][a-z]?_\d+\)_\d+)/g;

// New regex (fixed)
const newPattern = /([A-Z][a-z0-9]*_\d+\([A-Z][a-z0-9]*_\d+\)_\d+)/g;

console.log('=== OLD REGEX ===');
console.log('Text 1:', text1.match(oldPattern)); // null (PO не матчится)
console.log('Text 2:', text2.match(oldPattern)); // null

console.log('\n=== NEW REGEX ===');
console.log('Text 1:', text1.match(newPattern)); // ['X_3(PO_4)_2']
console.log('Text 2:', text2.match(newPattern)); // ['X_3(PO_4)_2']

// Test conversion
function convertChemistryToTiptapJson(text) {
  if (!text) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    };
  }

  const complexFormulaPattern = /([A-Z][a-z0-9]*_\d+\([A-Z][a-z0-9]*_\d+\)_\d+)/g;
  
  const complexMatches = [];
  let complexMatch;
  while ((complexMatch = complexFormulaPattern.exec(text)) !== null) {
    complexMatches.push({
      start: complexMatch.index,
      end: complexMatch.index + complexMatch[0].length,
      latex: complexMatch[0]
    });
  }
  
  if (complexMatches.length > 0) {
    const paragraphContent = [];
    let currentIndex = 0;
    
    complexMatches.forEach((match) => {
      if (match.start > currentIndex) {
        const beforeText = text.substring(currentIndex, match.start);
        if (beforeText) {
          paragraphContent.push({
            type: 'text',
            text: beforeText
          });
        }
      }
      
      paragraphContent.push({
        type: 'formula',
        attrs: { latex: match.latex }
      });
      
      currentIndex = match.end;
    });
    
    if (currentIndex < text.length) {
      const remainingText = text.substring(currentIndex);
      if (remainingText) {
        paragraphContent.push({
          type: 'text',
          text: remainingText
        });
      }
    }
    
    return {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: paragraphContent
      }]
    };
  }
  
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }]
    }]
  };
}

console.log('\n=== CONVERSION TEST ===');
const result1 = convertChemistryToTiptapJson(text1);
console.log('Result 1:', JSON.stringify(result1, null, 2));

const result2 = convertChemistryToTiptapJson(text2);
console.log('Result 2:', JSON.stringify(result2, null, 2));
