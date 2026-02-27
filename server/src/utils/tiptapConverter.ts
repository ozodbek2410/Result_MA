/**
 * TipTap JSON to LaTeX Converter
 * 
 * Converts TipTap editor JSON format to LaTeX strings for Word export
 * IMPROVED: Better handling of empty content, formulas, and edge cases
 */

/**
 * Main conversion function
 * @param json - TipTap JSON object or string
 * @returns LaTeX formatted string
 */
export function convertTiptapToLatex(json: any): string {
  // Null/undefined check
  if (!json) {
    console.log('⚠️ [CONVERT] Received null/undefined json');
    return '';
  }
  
  // Number check - convert to string
  if (typeof json === 'number') {
    return json.toString();
  }
  
  // String passthrough
  if (typeof json === 'string') {
    try {
      // Try to parse if it's JSON string
      const parsed = JSON.parse(json);
      return convertTiptapToLatex(parsed);
    } catch {
      // Not JSON, return as is
      return json;
    }
  }
  
  // No type property - might be plain object or number
  if (!json.type) {
    const jsonStr = JSON.stringify(json).substring(0, 100);
    console.log('⚠️ [CONVERT] No type property:', jsonStr);
    
    // Check if it has content array directly
    if (json.content && Array.isArray(json.content)) {
      return json.content
        .map((node: any) => convertTiptapToLatex(node))
        .filter((t: string) => t && t.length > 0)
        .join('');
    }
    
    // If it's a plain value (number, string, etc), convert to string
    if (json.value !== undefined) {
      console.log('✓ [CONVERT] Using json.value:', json.value);
      return String(json.value);
    }
    
    // Check if it's a simple object with one key-value pair
    if (typeof json === 'object' && Object.keys(json).length === 1) {
      const firstKey = Object.keys(json)[0];
      const firstValue = json[firstKey];
      
      if (typeof firstValue === 'string' || typeof firstValue === 'number') {
        console.log(`✓ [CONVERT] Using single property ${firstKey}:`, firstValue);
        return String(firstValue);
      }
    }
    
    // If json itself looks like a primitive wrapped in object
    if (typeof json === 'object' && !Array.isArray(json)) {
      // Try to extract any primitive value
      const values = Object.values(json);
      if (values.length === 1 && (typeof values[0] === 'string' || typeof values[0] === 'number')) {
        console.log('✓ [CONVERT] Extracted primitive:', values[0]);
        return String(values[0]);
      }
    }
    
    console.log('⚠️ [CONVERT] Could not extract value from:', jsonStr);
    return '';
  }
  
  let text = '';
  
  // Text node with potential formula mark
  if (json.type === 'text') {
    text = json.text || '';
    
    // Check for formula marks
    if (json.marks && Array.isArray(json.marks)) {
      for (const mark of json.marks) {
        if (mark.type === 'formula' && mark.attrs?.latex) {
          // Wrap in $ for LaTeX
          const latex = mark.attrs.latex.trim();
          text = `$${latex}$`;
          console.log(`✓ [CONVERT] Formula mark: ${latex}`);
        }
      }
    }
    
    return text;
  }
  
  // Formula node (standalone)
  if (json.type === 'formula' && json.attrs?.latex) {
    const latex = json.attrs.latex.trim();
    text = `$${latex}$`;
    console.log(`✓ [CONVERT] Formula node: ${latex}`);
    return text;
  }
  
  // Paragraph or doc node - process children
  if (json.type === 'paragraph' || json.type === 'doc') {
    if (json.content && Array.isArray(json.content)) {
      const parts = json.content
        .map((node: any) => convertTiptapToLatex(node))
        .filter((t: string) => t && t.length > 0); // Filter empty strings
      
      text = parts.join('');
    }
    
    // Add space after paragraph (but not if empty)
    if (json.type === 'paragraph' && text.length > 0) {
      text += ' ';
    }
    
    return text;
  }
  
  // Generic node with content
  if (json.content && Array.isArray(json.content)) {
    const parts = json.content
      .map((node: any) => convertTiptapToLatex(node))
      .filter((t: string) => t && t.length > 0); // Filter empty strings
    
    text = parts.join('');
  }
  
  // Log if we're returning empty for a non-empty structure
  if (text.length === 0 && (json.content || json.text || json.attrs)) {
    console.log('⚠️ [CONVERT] Returning empty for non-empty structure:');
    console.log('   Type:', json.type);
    console.log('   Has content:', !!json.content);
    console.log('   Has text:', !!json.text);
    console.log('   Has attrs:', !!json.attrs);
    console.log('   Full JSON:', JSON.stringify(json).substring(0, 300));
  }
  
  return text;
}

/**
 * Convert HTML string with data-latex spans to LaTeX formatted text
 * Input:  '<p>2 <span data-latex="\\frac{3}{7}" data-type="formula"></span></p>'
 * Output: '2 $\\frac{3}{7}$'
 */
function convertHtmlWithLatex(html: string): string {
  // Replace <span data-latex="..." ...></span> with $latex$
  let result = html.replace(/<span[^>]*data-latex="([^"]*)"[^>]*><\/span>/g, (_m, latex) => {
    return `$${latex}$`;
  });
  // Strip remaining HTML tags
  result = result.replace(/<[^>]*>/g, '');
  // Clean up whitespace
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * Convert variant text (handles both string and TipTap JSON)
 * @param variantText - Variant text (string or TipTap JSON)
 * @returns LaTeX formatted string
 */
export function convertVariantText(variantText: any): string {
  if (!variantText) {
    console.log('⚠️ [VARIANT] Empty variant text');
    return '';
  }
  
  // If it's already a string, try to parse it
  if (typeof variantText === 'string') {
    // HTML with data-latex attributes → extract LaTeX and plain text
    if (variantText.includes('data-latex=')) {
      return convertHtmlWithLatex(variantText);
    }

    try {
      const parsed = JSON.parse(variantText);
      const result = convertTiptapToLatex(parsed);

      if (!result || result.trim().length === 0) {
        console.log('⚠️ [VARIANT] Conversion returned empty, using original string');
        return variantText;
      }

      return result;
    } catch {
      // Not JSON, return as is
      return variantText;
    }
  }
  
  // It's an object, convert it
  const result = convertTiptapToLatex(variantText);
  
  if (!result || result.trim().length === 0) {
    console.log('⚠️ [VARIANT] Conversion returned empty for object:', JSON.stringify(variantText).substring(0, 200));
  }
  
  return result;
}
