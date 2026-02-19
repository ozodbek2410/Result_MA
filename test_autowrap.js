// Test auto-wrap formulas

const testCases = [
  ". X_3(PO_4)_2 ning molyar massasi 454 g/mol bo'lsa",
  "CH_4 va C_3H_8 dan iborat 0.5 mol aralashmada",
  "H_2SO_3 tarkibidagi protonlar sonini toping",
  "3.01*10^{23} dona molekula",
  "NH_3 da nechta atom bor"
];

function autoWrapFormulas(text) {
  let result = text;
  
  // 1. Complex formulas: X_3(PO_4)_2 → $X_3(PO_4)_2$
  result = result.replace(/([A-Z][A-Za-z0-9]*_\d+\([A-Z][A-Za-z0-9]*_\d+\)_\d+)/g, '§§§$1§§§');
  // 2. Simple formulas: CH_4, H_2SO_3, C_3H_8 → $CH_4$, $H_2SO_3$, $C_3H_8$
  result = result.replace(/((?:[A-Z][A-Za-z0-9]*_\d+)+)/g, '§§§$1§§§');
  // 3. Superscripts: 10^{23} → $10^{23}$
  result = result.replace(/(\d+)\^(\d+|{[^}]+})/g, '§§§$1^$2§§§');
  // 4. LaTeX commands: \cdot → $\cdot$
  result = result.replace(/(\\cdot)/g, '§§§$1§§§');
  // 5. Replace markers with $
  result = result.replace(/§§§/g, '$');
  
  return result;
}

testCases.forEach((text, idx) => {
  console.log(`\n=== TEST ${idx + 1} ===`);
  console.log('Input: ', text);
  console.log('Output:', autoWrapFormulas(text));
});
