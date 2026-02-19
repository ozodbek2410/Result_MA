// Test simple formulas

function convertChemistryToTiptapJson(text) {
  if (!text) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }]
    };
  }

  if (text.includes('\\(') || text.includes('\\[')) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  }

  // Complex formulas first
  const complexFormulaPattern = /([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g;
  
  let hasComplexFormula = false;
  const complexMatches = [];
  
  let complexMatch;
  while ((complexMatch = complexFormulaPattern.exec(text)) !== null) {
    hasComplexFormula = true;
    complexMatches.push({
      start: complexMatch.index,
      end: complexMatch.index + complexMatch[0].length,
      latex: complexMatch[0]
    });
  }
  
  if (hasComplexFormula) {
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
  
  // Simple formulas
  const chemistryPattern = /((?:[A-Z][A-Za-z0-9]*_\d+)+)|(\d+)\^(\d+|{[^}]+})|\\cdot/g;
  
  const paragraphContent = [];
  let currentIndex = 0;
  let match;
  
  while ((match = chemistryPattern.exec(text)) !== null) {
    if (match.index > currentIndex) {
      const beforeText = text.substring(currentIndex, match.index);
      if (beforeText) {
        paragraphContent.push({
          type: 'text',
          text: beforeText
        });
      }
    }
    
    const fullMatch = match[0];
    paragraphContent.push({
      type: 'formula',
      attrs: { latex: fullMatch }
    });
    
    currentIndex = match.index + fullMatch.length;
  }
  
  if (currentIndex < text.length) {
    const remainingText = text.substring(currentIndex);
    if (remainingText) {
      paragraphContent.push({
        type: 'text',
        text: remainingText
      });
    }
  }
  
  if (paragraphContent.length === 0) {
    return {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text }]
      }]
    };
  }
  
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: paragraphContent
    }]
  };
}

// Test cases
const testCases = [
  "X_3(PO_4)_2 ning molyar massasi",
  "CH_4 va C_3H_8 dan iborat",
  "H_2SO_3 tarkibidagi protonlar",
  "NH_3 da nechta atom",
  "3.01*10^{23} dona"
];

testCases.forEach((text, idx) => {
  console.log(`\n=== TEST ${idx + 1}: ${text} ===`);
  const result = convertChemistryToTiptapJson(text);
  console.log(JSON.stringify(result, null, 2));
});
