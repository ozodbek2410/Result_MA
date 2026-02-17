/**
 * Конвертирует TipTap JSON в простой текст
 */
export function convertTiptapJsonToText(json: any): string {
  if (!json) return '';
  
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch {
      return json;
    }
  }
  
  if (!json.type) return '';
  
  let text = '';
  
  if (json.type === 'text') {
    text = json.text || '';
    
    // Обработка marks (формулы, жирный текст и т.д.)
    if (json.marks) {
      for (const mark of json.marks) {
        if (mark.type === 'formula' && mark.attrs?.latex) {
          text = `$${mark.attrs.latex}$`;
        }
      }
    }
    
    return text;
  }
  
  if (json.type === 'formula' && json.attrs?.latex) {
    return `$${json.attrs.latex}$`;
  }
  
  if (json.type === 'paragraph' || json.type === 'doc') {
    if (json.content && Array.isArray(json.content)) {
      text = json.content.map((node: any) => convertTiptapJsonToText(node)).join('');
    }
    return text + (json.type === 'paragraph' ? '\n' : '');
  }
  
  if (json.content && Array.isArray(json.content)) {
    text = json.content.map((node: any) => convertTiptapJsonToText(node)).join('');
  }
  
  return text;
}
