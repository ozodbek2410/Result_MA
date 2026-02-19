// Test auto-wrap formulas - FINAL FIX

const testCases = [
  ". X_3(PO_4)_2 ning molyar massasi 454 g/mol bo'lsa",
  "CH_4 va C_3H_8 dan iborat 0.5 mol aralashmada",
  "H_2SO_3 tarkibidagi protonlar sonini toping",
  "3.01*10^{23} dona molekula",
  "NH_3 da nechta atom bor"
];

function autoWrapFormulas(text) {
  let result = text;
  
  // Step 1: Extract and mark complex formulas
  const complexFormulas = [];
  result = result.replace(/([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g, (match) => {
    const idx = complexFormulas.length;
    complexFormulas.push(match);
    return `⟪COMPLEX_${idx}⟫`;
  });
  
  // Step 2: Wrap simple formulas (CH_4, H_2SO_3, C_3H_8)
  // Use function to avoid $1 replacement issue
  result = result.replace(/((?:[A-Z][A-Za-z0-9]*_\d+)+)/g, (match) => {
    return '$' + match + '$';
  });
  
  // Step 3: Wrap superscripts (10^{23})
  result = result.replace(/(\d+)\^(\d+|{[^}]+})/g, (match, num, exp) => {
    return '$' + num + '^' + exp + '$';
  });
  
  // Step 4: Wrap LaTeX commands (\cdot)
  result = result.replace(/(\\cdot)/g, (match) => {
    return '$' + match + '$';
  });
  
  // Step 5: Restore complex formulas with $ wrapping
  complexFormulas.forEach((formula, idx) => {
    const placeholder = `⟪COMPLEX_${idx}⟫`;
    const wrapped = '$' + formula + '$';
    result = result.split(placeholder).join(wrapped);
  });
  
  return result;
}

testCases.forEach((text, idx) => {
  console.log(`\n=== TEST ${idx + 1} ===`);
  console.log('Input: ', text);
  console.log('Output:', autoWrapFormulas(text));
});
