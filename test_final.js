// Final test for ChemistryParser

function cleanChemistryText(text) {
  let cleaned = text
    .replace(/\\\'/g, "'")
    .replace(/\\\./g, ".")
    .replace(/\\\)/g, ")")
    .replace(/\\`/g, "'")  // bo\` → bo'
    .replace(/\s+/g, ' ')
    .trim();
  
  // CHEMISTRY: Convert special characters to LaTeX
  cleaned = cleaned.replace(/∙/g, '\\cdot ');
  cleaned = cleaned.replace(/·/g, '\\cdot ');
  
  // CHEMISTRY: Fix escaped asterisk (1,66\*10 → 1,66 \cdot 10)
  cleaned = cleaned.replace(/\\\*/g, ' \\cdot ');
  
  // CHEMISTRY: Convert Pandoc subscript/superscript to LaTeX format
  cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');
  cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^{$2}');
  
  // CHEMISTRY: Fix XO → X_2O (add subscript if missing)
  cleaned = cleaned.replace(/\b([A-Z])O\s+ning/g, '$1_2O ning');
  cleaned = cleaned.replace(/\b([A-Z])O\s+ni/g, '$1_2O ni');
  
  // Kimyoviy formulalardagi bo'shliqlarni olib tashlash
  cleaned = cleaned.replace(/([