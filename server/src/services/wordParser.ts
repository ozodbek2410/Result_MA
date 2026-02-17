import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

interface ParsedQuestion {
  text: string;
  variants: { letter: string; text: string }[];
  correctAnswer: string;
  points: number;
  imageUrl?: string; // URL извлеченного изображения
}

export class WordParser {
  private extractedImages: Map<string, string> = new Map(); // image filename -> saved URL
  
  async parseDocx(filePath: string): Promise<ParsedQuestion[]> {
    try {
      console.log('📄 [WORD] Parsing DOCX with pandoc...');
      
      // Извлекаем изображения из DOCX
      await this.extractImagesFromDocx(filePath);
      
      const rawMarkdown = await this.extractTextWithPandoc(filePath);
      
      // Сохраняем сырой markdown для отладки
      console.log('📝 [WORD] Raw Markdown length:', rawMarkdown.length);
      console.log('📝 [WORD] First 500 chars:', rawMarkdown.substring(0, 500));
      
      const { cleanText, mathBlocks } = this.preCleanAndHideMath(rawMarkdown);
      
      console.log('🧹 [WORD] Cleaned text length:', cleanText.length);
      console.log('🧹 [WORD] Math blocks found:', mathBlocks.length);
      
      // Ищем все номера вопросов в тексте
      const allNumberMatches = cleanText.match(/(?:^|\s|\n)(?:\*\*|__)?(\d+)(?:\*\*|__)?\)\s+/g);
      console.log('🔢 [WORD] All number patterns found:', allNumberMatches?.length || 0);
      if (allNumberMatches) {
        const numbers = allNumberMatches.map(m => m.match(/(\d+)/)?.[1]).filter(Boolean);
        console.log('🔢 [WORD] Question numbers:', numbers.join(', '));
      }
      
      const questions = this.parseQuestions(cleanText, mathBlocks);
      console.log(`✅ [WORD] Parsed ${questions.length} questions`);
      
      // Показываем какие номера вопросов были успешно распознаны
      const parsedNumbers = questions.map((_, idx) => idx + 1);
      console.log('✅ [WORD] Successfully parsed questions:', parsedNumbers.join(', '));
      
      return questions;
    } catch (error) {
      console.error('❌ [WORD] Error:', error);
      throw new Error(
        `Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Извлекает изображения из DOCX файла
   * DOCX - это ZIP архив, изображения находятся в word/media/
   */
  private async extractImagesFromDocx(filePath: string): Promise<void> {
    try {
      console.log('📸 [WORD] Extracting images from DOCX...');
      
      // Очищаем предыдущие изображения
      this.extractedImages.clear();
      
      // Читаем DOCX как ZIP
      const zip = new AdmZip(filePath);
      const zipEntries = zip.getEntries();
      
      // Создаем директорию для сохранения изображений
      const uploadDir = path.join(process.cwd(), 'uploads', 'test-images');
      if (!fsSync.existsSync(uploadDir)) {
        fsSync.mkdirSync(uploadDir, { recursive: true });
      }
      
      // Собираем все изображения с их размерами
      const imageFiles: Array<{ entry: any; size: number; name: string }> = [];
      
      // Ищем изображения в word/media/
      for (const entry of zipEntries) {
        if (entry.entryName.startsWith('word/media/') && !entry.isDirectory) {
          const ext = path.extname(entry.entryName).toLowerCase();
          const fileName = path.basename(entry.entryName);
          
          // Поддерживаем только растровые изображения (пропускаем WMF/EMF)
          if (['.png', '.jpg', '.jpeg', '.gif', '.bmp'].includes(ext)) {
            const size = entry.header.size || 0;
            
            // Пропускаем слишком маленькие изображения (thumbnails, иконки)
            // Обычно полноразмерные изображения > 5KB
            if (size > 5000) {
              imageFiles.push({ entry, size, name: fileName });
              console.log(`📸 [WORD] Found image: ${fileName} (${Math.round(size / 1024)}KB)`);
            } else {
              console.log(`⚠️ [WORD] Skipping small image: ${fileName} (${Math.round(size / 1024)}KB) - likely thumbnail`);
            }
          } else if (['.wmf', '.emf'].includes(ext)) {
            console.log(`⚠️ [WORD] Skipping vector image: ${fileName} (WMF/EMF not supported in browsers)`);
          }
        }
      }
      
      // Сортируем по размеру (большие первыми) и по имени
      // Это помогает выбрать полноразмерные версии вместо thumbnails
      imageFiles.sort((a, b) => {
        // Сначала по имени (чтобы сохранить порядок из документа)
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        // Потом по размеру (большие первыми)
        return b.size - a.size;
      });
      
      // Сохраняем изображения
      let imageIndex = 0;
      const savedNames = new Set<string>();
      
      for (const { entry, size, name } of imageFiles) {
        // Пропускаем дубликаты (разные размеры одного изображения)
        const baseName = name.replace(/\d+$/, ''); // image1.png -> image.png
        if (savedNames.has(baseName)) {
          console.log(`⚠️ [WORD] Skipping duplicate: ${name}`);
          continue;
        }
        savedNames.add(baseName);
        
        imageIndex++;
        
        const ext = path.extname(entry.entryName).toLowerCase();
        
        // Генерируем уникальное имя файла
        const uniqueFilename = `${uuidv4()}${ext}`;
        const savePath = path.join(uploadDir, uniqueFilename);
        
        // Сохраняем изображение
        const imageData = entry.getData();
        await fs.writeFile(savePath, imageData);
        
        // Сохраняем URL (относительный путь для доступа через веб)
        const imageUrl = `/uploads/test-images/${uniqueFilename}`;
        
        // Сохраняем маппинг: image1, image2, ... -> URL
        this.extractedImages.set(`image${imageIndex}`, imageUrl);
        
        console.log(`✅ [WORD] Saved image${imageIndex}: ${name} (${Math.round(size / 1024)}KB) -> ${imageUrl}`);
      }
      
      console.log(`✅ [WORD] Extracted ${this.extractedImages.size} images`);
    } catch (error) {
      console.error('❌ [WORD] Error extracting images:', error);
      // Не бросаем ошибку, продолжаем без изображений
    }
  }

  private preCleanAndHideMath(text: string): { cleanText: string; mathBlocks: string[] } {
    let cleaned = text;

    // 1. УБИВАЕМ СЛЭШИ И КРИВЫЕ АПОСТРОФЫ (bo\`lsa -> bo'lsa)
    cleaned = cleaned.replace(/\\`/g, '`'); // чистим экранированный backtick
    cleaned = cleaned.replace(/`/g, "'"); // превращаем ВСЕ backticks в нормальные апострофы
    cleaned = cleaned.replace(/\\'/g, "'"); // чистим экранированный прямой апостроф
    cleaned = cleaned.replace(/\\"/g, '"');

    // 2. Удаляем маркеры заголовков Markdown (###, ##, #)
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, ''); // В начале строки
    cleaned = cleaned.replace(/\s+#{1,6}\s+/g, ' '); // В середине текста

    // 3. Конвертируем Pandoc subscript/superscript в LaTeX
    // Pandoc использует ~text~ для subscript и ^text^ для superscript
    // C~4~H~8~O -> C_4H_8O (затем обернем в LaTeX)
    cleaned = cleaned.replace(/([A-Za-z0-9])~([^~\s]+)~/g, '$1_$2');  // C~4~ -> C_4
    cleaned = cleaned.replace(/([A-Za-z0-9])\^([^\^\s]+)\^/g, '$1^$2'); // sp^2^ -> sp^2

    // 4. Распаковываем \mathbf{} ДО скрытия формул (сохраняем маркер правильного ответа)
    for (let i = 0; i < 3; i++) {
      cleaned = cleaned.replace(/\\(?:mathbf|boldsymbol|bf)\{([^{}]*)\}/g, '**$1**');
    }

    // 5. Конвертируем доллары в LaTeX
    cleaned = cleaned.replace(/\$\$(.*?)\$\$/gs, '\\($1\\)');
    cleaned = cleaned.replace(/\$(.*?)\$/gs, '\\($1\\)');

    // 6. ЯДЕРНЫЙ ВЗРЫВ ВАРИАНТОВ ВНУТРИ ФОРМУЛ
    // Если учитель написал `\sqrt{2}B)4` внутри Equation, мы выкидываем B) наружу!
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (mathBlock) => {
      // Ищем букву варианта после цифры, пробела или закрывающей скобки }
      return mathBlock.replace(
        /([0-9}\s])(\*\*|__)?([A-D])(\*\*|__)?(?:\\?\)|\\?\.)/g,
        '$1 \\) $2$3) \\( '
      );
    });
    // Убираем пустые формулы \( \), которые могли образоваться после взрыва
    cleaned = cleaned.replace(/\\\(\s*\\\)/g, ' ');

    // 7. УДАЛЯЕМ МАРКЕРЫ ИЗОБРАЖЕНИЙ ИЗ PANDOC
    // Pandoc создает маркеры типа: ![](media/image1.png){width="..." height="..."}
    // Мы их удаляем из текста, но сохраняем информацию о номере изображения
    cleaned = cleaned.replace(/!\[\]\(media\/image(\d+)\.[a-z]+\)(\{[^}]*\})?/gi, ' ___IMAGE_$1___ ');
    
    // Также обрабатываем другие форматы маркеров изображений
    cleaned = cleaned.replace(/!\[.*?\]\(.*?image(\d+).*?\)(\{[^}]*\})?/gi, ' ___IMAGE_$1___ ');

    // 8. ПРЯЧЕМ МАТЕМАТИКУ (ЗАЩИТНЫЙ КУПОЛ)
    const mathBlocks: string[] = [];
    cleaned = cleaned.replace(/\\\([\s\S]*?\\\)/g, (match) => {
      let cleanMath = match.replace(/\\ /g, ' ');
      mathBlocks.push(cleanMath);
      return ` ___MATH_${mathBlocks.length - 1}___ `;
    });

    // 9. ОТЛЕПЛЯЕМ СЛОВА ОТ ФОРМУЛ (e.g., \sqrt{6}ga -> \sqrt{6} ga)
    // Гарантируем, что текст никогда не прилипнет к защитному токену
    cleaned = cleaned.replace(/(___MATH_\d+___)([a-zA-Z])/g, '$1 $2');
    cleaned = cleaned.replace(/([a-zA-Z])(___MATH_\d+___)/g, '$1 $2');

    // 10. ТЕПЕРЬ БЕЗОПАСНО чистим эскейпы в тексте
    cleaned = cleaned.replace(/\\([.\(\)\[\]])/g, '$1');

    // 11. Нормализуем номера вопросов и вариантов (расставляем пробелы)
    cleaned = cleaned.replace(/(^|\s|\n)(\*\*|__)?(\d+)(\*\*|__)?\.\s*/g, '$1$2$3$4) ');
    cleaned = cleaned.replace(/([^\s\n])(\*\*|__)?([A-D])(\*\*|__)?\)/gi, '$1 $2$3$4)');
    cleaned = cleaned.replace(/(\d+|[A-D])(\*\*|__)?\)([^\s\n])/gi, '$1$2) $3');

    return { cleanText: cleaned, mathBlocks };
  }

  private async extractTextWithPandoc(filePath: string): Promise<string> {
    try {
      const pandocPaths = [
        'pandoc',
        'C:\\Program Files\\Pandoc\\pandoc.exe',
        '/usr/local/bin/pandoc',
        '/usr/bin/pandoc',
      ];

      let lastError: any;
      for (const pandocPath of pandocPaths) {
        try {
          const { stdout } = await execFileAsync(pandocPath, [
            filePath,
            '-f',
            'docx',
            '-t',
            'markdown',
            '--wrap=none',
          ]);
          return stdout;
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    } catch (error) {
      throw error;
    }
  }

  private parseQuestions(text: string, mathBlocks: string[]): ParsedQuestion[] {
    const questions: ParsedQuestion[] = [];

    // Ищем номер вопроса (гарантированно вне формул!)
    const questionPattern = /(?:^|\s|\n)(?:\*\*|__)?(\d+)(?:\*\*|__)?\)\s+/g;
    const matches = Array.from(text.matchAll(questionPattern));

    console.log(`🔍 [WORD] Found ${matches.length} question markers`);

    const validMatches = matches.filter((m) => {
      const num = parseInt(m[1]);
      return num >= 1 && num <= 100; // Увеличиваем лимит до 100
    });

    console.log(`✅ [WORD] Valid question markers: ${validMatches.length}`);

    for (let i = 0; i < validMatches.length; i++) {
      const currentMatch = validMatches[i];
      const nextMatch = validMatches[i + 1];
      const questionNum = parseInt(currentMatch[1]);

      const startIndex = currentMatch.index! + currentMatch[0].length;
      const endIndex = nextMatch ? nextMatch.index! : text.length;
      const block = text.substring(startIndex, endIndex).trim();

      console.log(`📝 [WORD] Processing question ${questionNum}...`);
      console.log(`   Block preview: ${block.substring(0, 100)}...`);

      const question = this.extractQuestion(block, questionNum, mathBlocks);
      if (question) {
        questions.push(question);
        console.log(`✅ [WORD] Question ${questionNum} extracted successfully`);
      } else {
        console.log(`⚠️ [WORD] Question ${questionNum} skipped - no variants found`);
        console.log(`   Full block: ${block.substring(0, 300)}`);
      }
    }

    console.log(`📊 [WORD] Final result: ${questions.length} questions extracted`);
    return questions;
  }

  private extractQuestion(
    block: string,
    qNum: number,
    mathBlocks: string[]
  ): ParsedQuestion | null {
    // Ищем буквы вариантов: A), B), C), D) или A., B., C., D. вне формул!
    // Сначала пробуем со скобками
    let variantPattern = /(?:^|\s)(?:\*\*|__)?([A-D])(?:\*\*|__)?\)\s*/gi;
    let variantMatches = Array.from(block.matchAll(variantPattern));
    
    // Если не нашли со скобками, пробуем с точками
    if (variantMatches.length === 0) {
      variantPattern = /(?:^|\s)(?:\*\*|__)?([A-D])(?:\*\*|__)?\.\s+/gi;
      variantMatches = Array.from(block.matchAll(variantPattern));
      console.log(`   ℹ️ Trying variant pattern with dots for question ${qNum}`);
    }

    if (variantMatches.length === 0) {
      console.log(`   ⚠️ No variants found for question ${qNum}`);
      console.log(`   Block text: ${block.substring(0, 200)}`);
      return null;
    }

    console.log(`   ✓ Found ${variantMatches.length} variants: ${variantMatches.map(m => m[1]).join(', ')}`);

    const rawQText = block.substring(0, variantMatches[0].index!);
    
    // Проверяем есть ли изображение для этого вопроса
    let imageUrl: string | undefined;
    
    // Ищем маркеры изображений ___IMAGE_N___ в тексте вопроса
    const imageMarkerMatch = rawQText.match(/___IMAGE_(\d+)___/);
    if (imageMarkerMatch) {
      const imageNum = imageMarkerMatch[1];
      const imageKey = `image${imageNum}`;
      imageUrl = this.extractedImages.get(imageKey);
      if (imageUrl) {
        console.log(`   📸 Question ${qNum} linked to ${imageKey}: ${imageUrl}`);
      } else {
        console.log(`   ⚠️ Question ${qNum} has marker ${imageKey} but image not found`);
      }
    }
    
    // Если не нашли по маркеру, пробуем по порядку (первое изображение к первому вопросу и т.д.)
    if (!imageUrl && this.extractedImages.size > 0) {
      const imageKey = `image${qNum}`;
      imageUrl = this.extractedImages.get(imageKey);
      if (imageUrl) {
        console.log(`   📸 Question ${qNum} auto-linked to ${imageKey}: ${imageUrl}`);
      }
    }
    
    // Очищаем текст вопроса от маркеров изображений
    const qText = this.finalCleanText(rawQText, mathBlocks);

    let correctAnswer = 'A';
    const variants: { letter: string; text: string }[] = [];

    for (let i = 0; i < variantMatches.length; i++) {
      const match = variantMatches[i];
      const letter = match[1].toUpperCase();

      const startIndex = match.index! + match[0].length;
      const endIndex = variantMatches[i + 1] ? variantMatches[i + 1].index! : block.length;
      const rawVariantText = block.substring(startIndex, endIndex);

      // Временно восстанавливаем математику, чтобы проверить жирность (отвечает за правильный ответ)
      const restoredVariantText = this.restoreMath(rawVariantText, mathBlocks);
      if (
        match[0].includes('**') ||
        match[0].includes('__') ||
        restoredVariantText.includes('**') ||
        restoredVariantText.includes('__')
      ) {
        correctAnswer = letter;
        console.log(`   ✓ Correct answer detected: ${letter}`);
      }

      variants.push({
        letter,
        text: this.finalCleanText(rawVariantText, mathBlocks),
      });
    }

    // Ensure all 4 variants exist
    if (variants.length < 4) {
      const letters = ['A', 'B', 'C', 'D'];
      const existing = variants.map((v) => v.letter);
      letters.forEach((l) => {
        if (!existing.includes(l)) variants.push({ letter: l, text: '' });
      });
      variants.sort((a, b) => a.letter.localeCompare(b.letter));
    }

    return {
      text: qText,
      variants,
      correctAnswer,
      points: 1,
      imageUrl, // Добавляем URL изображения
    };
  }

  private restoreMath(text: string, mathBlocks: string[]): string {
    // Возвращаем формулы на место токенов ___MATH_N___
    return text.replace(/___MATH_(\d+)___/g, (m, idx) => mathBlocks[parseInt(idx)] || m);
  }

  private finalCleanText(text: string, mathBlocks: string[]): string {
    let restored = this.restoreMath(text, mathBlocks);

    // 1. Удаляем маркеры изображений
    restored = restored.replace(/___IMAGE_\d+___/g, '').trim();

    // 2. Удаляем маркеры жирности (чтобы студенты не увидели ответ)
    restored = restored.replace(/\*\*/g, '').replace(/__/g, '');

    // 3. Убираем артефакты пандока (висящие текстовые теги внутри формул)
    restored = restored.replace(/\\(mathrm|text|rm)\{([^{}]*)\}/g, '$2');

    // 4. Убираем висящие слеши (\\\\) в конце строки
    restored = restored.replace(/\\\\+\s*$/, '');

    // 5. Конвертируем Unicode индексы и надстрочные символы в LaTeX (для химии)
    restored = this.convertUnicodeToLatex(restored);

    return restored.trim();
  }

  private convertUnicodeToLatex(text: string): string {
    // Карты Unicode символов
    const subscripts: { [key: string]: string } = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
      '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
      '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')'
    };
    
    const superscripts: { [key: string]: string } = {
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
      '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')'
    };

    let result = text;

    // Конвертируем научную нотацию в LaTeX
    // 3,01×10^23 -> 3,01\times10^{23} -> \(3,01\times10^{23}\)
    // 6,02x10^23 -> 6,02\times10^{23} -> \(6,02\times10^{23}\)
    result = result.replace(/(\d+[,.]?\d*)\s*[×x]\s*10\^(-?\d+)/gi, (match, base, exp) => {
      return `\\(${base}\\times10^{${exp}}\\)`;
    });

    // Конвертируем последовательности индексов
    // Например: H₃C → H_3C или CH₂ → CH_2
    result = result.replace(/([A-Za-z])([₀-₉₊₋₌₍₎]+)/g, (match, base, subs) => {
      const converted = subs.split('').map((c: string) => subscripts[c] || c).join('');
      // Если один символ - без скобок, если несколько - со скобками
      return converted.length === 1 ? `${base}_${converted}` : `${base}_{${converted}}`;
    });

    // Конвертируем последовательности надстрочных символов
    // Например: sp² → sp^2 или sp³ → sp^3
    result = result.replace(/([A-Za-z0-9])([⁰-⁹⁺⁻⁼⁽⁾]+)/g, (match, base, sups) => {
      const converted = sups.split('').map((c: string) => superscripts[c] || c).join('');
      // Если один символ - без скобок, если несколько - со скобками
      return converted.length === 1 ? `${base}^${converted}` : `${base}^{${converted}}`;
    });

    // Оборачиваем химические формулы в LaTeX если они еще не обернуты
    // Ищем паттерны типа H_3C, CH_2, sp^2 и оборачиваем в \( \)
    // Также ищем последовательности букв с индексами: C_4H_8O
    result = result.replace(/([A-Z][a-z]?(?:[_^]\{?[0-9+\-=()]+\}?)+(?:[A-Z][a-z]?(?:[_^]\{?[0-9+\-=()]+\}?)*)*)/g, (match, formula) => {
      // Проверяем что формула еще не обернута
      const matchIndex = result.indexOf(match);
      const beforeMatch = result.substring(Math.max(0, matchIndex - 3), matchIndex);
      if (beforeMatch.includes('\\(') || beforeMatch.includes('$')) {
        return match; // Уже обернута
      }
      return `\\(${formula}\\)`;
    });

    return result;
  }
}

export const wordParser = new WordParser();
