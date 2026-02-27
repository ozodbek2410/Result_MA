/**
 * OMML (Office Math Markup Language) utilities
 * Convert OMML to MathML for browser rendering
 */

/**
 * Convert OMML formula to MathML for display
 * @param omml - OMML string from Word
 * @returns MathML string for rendering
 */
export function ommlToMathML(omml: string): string {
  try {
    console.log('🔄 [OMML] Converting to MathML:', omml.substring(0, 100));
    
    // Parse OMML JSON structure
    const ommlObj = JSON.parse(omml);
    
    // Convert OMML structure to MathML
    const mathml = convertOmmlObject(ommlObj);
    
    console.log('✅ [OMML] Converted to MathML:', mathml.substring(0, 100));
    
    return mathml;
  } catch (error) {
    console.error('❌ [OMML] Conversion error:', error);
    return omml; // Return original if conversion fails
  }
}

/**
 * Convert OMML object structure to MathML
 */
function convertOmmlObject(obj: any): string {
  if (!obj || typeof obj !== 'object') {
    return '';
  }
  
  // Handle different OMML elements
  if (obj['m:r']) {
    // Math run - contains text
    return convertMathRun(obj['m:r']);
  }
  
  if (obj['m:f']) {
    // Fraction
    return convertFraction(obj['m:f']);
  }
  
  if (obj['m:sup']) {
    // Superscript
    return convertSuperscript(obj['m:sup']);
  }
  
  if (obj['m:sub']) {
    // Subscript
    return convertSubscript(obj['m:sub']);
  }
  
  if (obj['m:rad']) {
    // Radical (square root)
    return convertRadical(obj['m:rad']);
  }
  
  // Recursively process arrays
  if (Array.isArray(obj)) {
    return obj.map(item => convertOmmlObject(item)).join('');
  }
  
  // Recursively process object properties
  let result = '';
  for (const key in obj) {
    result += convertOmmlObject(obj[key]);
  }
  
  return result;
}

/**
 * Convert math run (text) to MathML
 */
function convertMathRun(run: any): string {
  if (Array.isArray(run)) {
    return run.map(r => convertMathRun(r)).join('');
  }
  
  if (run['m:t']) {
    const text = Array.isArray(run['m:t']) ? run['m:t'][0] : run['m:t'];
    return `<mi>${text}</mi>`;
  }
  
  return '';
}

/**
 * Convert fraction to MathML
 */
function convertFraction(frac: any): string {
  if (Array.isArray(frac)) {
    frac = frac[0];
  }
  
  const numerator = frac['m:num'] ? convertOmmlObject(frac['m:num']) : '';
  const denominator = frac['m:den'] ? convertOmmlObject(frac['m:den']) : '';
  
  return `<mfrac>${numerator}${denominator}</mfrac>`;
}

/**
 * Convert superscript to MathML
 */
function convertSuperscript(sup: any): string {
  if (Array.isArray(sup)) {
    sup = sup[0];
  }
  
  const base = sup['m:e'] ? convertOmmlObject(sup['m:e']) : '';
  const exponent = sup['m:sup'] ? convertOmmlObject(sup['m:sup']) : '';
  
  return `<msup>${base}${exponent}</msup>`;
}

/**
 * Convert subscript to MathML
 */
function convertSubscript(sub: any): string {
  if (Array.isArray(sub)) {
    sub = sub[0];
  }
  
  const base = sub['m:e'] ? convertOmmlObject(sub['m:e']) : '';
  const subscript = sub['m:sub'] ? convertOmmlObject(sub['m:sub']) : '';
  
  return `<msub>${base}${subscript}</msub>`;
}

/**
 * Convert radical (square root) to MathML
 */
function convertRadical(rad: any): string {
  if (Array.isArray(rad)) {
    rad = rad[0];
  }
  
  const content = rad['m:e'] ? convertOmmlObject(rad['m:e']) : '';
  
  return `<msqrt>${content}</msqrt>`;
}

/**
 * Extract OMML formulas from text
 * @param text - Text with <omml>...</omml> tags
 * @returns Array of { formula: string, position: number }
 */
export function extractOmmlFromText(text: string): Array<{ formula: string; position: number }> {
  const formulas: Array<{ formula: string; position: number }> = [];
  const regex = /<omml>(.*?)<\/omml>/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    formulas.push({
      formula: match[1],
      position: match.index,
    });
  }
  
  return formulas;
}

/**
 * Replace OMML tags with rendered MathML
 * @param text - Text with <omml>...</omml> tags
 * @returns Text with MathML formulas
 */
export function renderOmmlInText(text: string): string {
  return text.replace(/<omml>(.*?)<\/omml>/g, (match, omml) => {
    const mathml = ommlToMathML(omml);
    return `<math xmlns="http://www.w3.org/1998/Math/MathML">${mathml}</math>`;
  });
}
