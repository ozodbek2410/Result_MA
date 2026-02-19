// Full conversion test with fixed regex

function convertChemistryToTiptapJson(text) {
  if (!text) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    };
  }

  // Agar \(...\) yoki \[...\] bor bo'lsa, oddiy convertLatexToTiptapJson ishlatamiz
  if (text.includes('\\(') || text.includes('\\[')) {
    console.log('Has LaTeX delimiters, using standard conversion');
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  }

  // Fixed regex: [A-Z][A-Za-z0-9]* to match PO, SO4, etc.
  const complexFormulaPattern = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
  
  const complexMatches = [];
  let complexMatch;
  while ((complexMatch = complexFormulaPattern.exec(text)) !== null) {
    complexMatches.push({
      start: complexMatch.index,
      end: complexMatch.index + complexMatch[0].length,
      latex: complexMatch[0]
    });
  }
  
  console.log('Complex matches found:', complexMatches.length);
  
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
  
  console.log('No complex formulas, returning plain text');
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text }]
    }]
  };
}

// Test cases
const testCases = [
  ". X_3(PO_4)_2 ning molyar massasi 454 g/mol bo'lsa, ''X'' nomalum elementni toping.",
  "X_3(PO_4)_2 ning molyar massasi 454 g/mol",
  "CH_4 va C_3H_8 dan iborat",
  "H_2SO_3 tarkibidagi protonlar"
];

testCases.forEach((text, idx) => {
  console.log(`\n=== TEST CASE ${idx + 1} ===`);
  console.log('Input:', text);
  const result = convertChemistryToTiptapJson(text);
  console.log('Output:', JSON.stringify(result, null, 2));
});
