import dotenv from 'dotenv';
dotenv.config();

interface GroqQuestion {
  number: number;
  text: string;
  options: {
    [key: string]: string;
  };
}

interface GroqResponse {
  questions: GroqQuestion[];
}

interface KeyStatus {
  key: string;
  index: number;
  isAvailable: boolean;
  usageCount: number;
  lastError: number | null;
  lastSuccess: number | null;
  consecutiveErrors: number;
  rateLimitUntil: number | null;
}

interface ParseLog {
  timestamp: number;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  keyIndex?: number;
}

export class GroqService {
  private static readonly GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  private static readonly META_MODEL = 'llama-3.1-8b-instant'; // Быстрая модель с высоким лимитом
  private static readonly FALLBACK_MODEL = 'llama-3.3-70b-versatile'; // Мощная модель для fallback
  
  // Хранилище статусов ключей
  private static keyStatuses: Map<string, KeyStatus> = new Map();
  private static apiKeys: string[] = [];
  
  // Логи для фронтенда
  private static currentLogs: ParseLog[] = [];
  
  // Настройки повторных попыток
  private static readonly MAX_RETRIES_PER_KEY = 2; // Повторить 2 раза перед переключением
  private static readonly RATE_LIMIT_COOLDOWN = 60000; // 1 минута
  private static readonly ERROR_COOLDOWN = 30000; // 30 секунд для других ошибок
  private static readonly MAX_CONSECUTIVE_ERRORS = 3; // Максимум ошибок подряд
  
  private static readonly SYSTEM_PROMPT = `Ты анализируешь школьные тесты из Word документов или фотографий.

ТВОЯ ЗАДАЧА:
1. Найти все вопросы в тексте
2. Для каждого вопроса извлечь:
   - Текст вопроса
   - Варианты ответов (если есть)
3. Сохранить математические формулы в формате LaTeX

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ПРАВИЛА:

1. СТРУКТУРА ВОПРОСОВ
   - Каждый вопрос обычно начинается с номера: "1.", "2.", "3." и т.д.
   - НЕ объединяй разные вопросы в один
   - Игнорируй заголовки, номера страниц, инструкции

2. ВАРИАНТЫ ОТВЕТОВ
   - Варианты обычно обозначены: A), B), C), D) или а), б), в), г)
   - Если вариантов НЕТ - оставь "options" пустым объектом {}
   - НЕ придумывай варианты, если их нет в тексте
   - Если варианты есть, но без букв - присвой A, B, C, D по порядку

3. МАТЕМАТИЧЕСКИЕ ФОРМУЛЫ
   - Если видишь математические символы (x², ≤, ≥, √, π и т.д.) - конвертируй в LaTeX
   - Формат: \\\\(формула\\\\) для inline формул
   - Примеры конвертации:
     * x² → \\\\(x^2\\\\)
     * x ≤ 5 → \\\\(x \\\\leq 5\\\\)
     * √x → \\\\(\\\\sqrt{x}\\\\)
     * π → \\\\(\\\\pi\\\\)
   - Если формула уже в формате \\( ... \\) - оставь как есть
   - Если формула нечитаема - просто скопируй текст как есть, учитель сам исправит

4. ОБЫЧНЫЙ ТЕКСТ
   - НЕ оборачивай обычный текст в \\text{}
   - Имена, названия, слова - оставляй как обычный текст
   - Пример: "А.П.Чехов" → просто "А.П.Чехов", НЕ "\\text{А.П.Чехов}"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ФОРМАТ ВЫВОДА (только JSON, без текста):

{
  "questions": [
    {
      "number": 1,
      "text": "Текст вопроса",
      "options": {
        "A": "Вариант A",
        "B": "Вариант B"
      }
    },
    {
      "number": 2,
      "text": "Вопрос без вариантов",
      "options": {}
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ПРИМЕРЫ:

Пример 1 - С вариантами:
Входной текст:
"1. Решите уравнение x²-4=0
A) x=2  B) x=-2  C) x=±2  D) нет решений"

Вывод:
{
  "questions": [
    {
      "number": 1,
      "text": "Решите уравнение \\\\(x^2-4=0\\\\)",
      "options": {
        "A": "\\\\(x=2\\\\)",
        "B": "\\\\(x=-2\\\\)",
        "C": "\\\\(x=\\\\pm 2\\\\)",
        "D": "нет решений"
      }
    }
  ]
}

Пример 2 - Без вариантов:
Входной текст:
"1. Кто написал роман 'Война и мир'? ___________"

Вывод:
{
  "questions": [
    {
      "number": 1,
      "text": "Кто написал роман 'Война и мир'? ___________",
      "options": {}
    }
  ]
}

Пример 3 - Литература с вариантами:
Входной текст:
"1. Кто автор романа 'Евгений Онегин'?
A) А.С.Пушкин  B) Л.Н.Толстой  C) Ф.М.Достоевский"

Вывод:
{
  "questions": [
    {
      "number": 1,
      "text": "Кто автор романа 'Евгений Онегин'?",
      "options": {
        "A": "А.С.Пушкин",
        "B": "Л.Н.Толстой",
        "C": "Ф.М.Достоевский"
      }
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ВАЖНО:
- Возвращай ТОЛЬКО JSON, без дополнительного текста
- Если не уверен в формуле - лучше оставь как есть
- НЕ решай задачи, НЕ выбирай правильные ответы
- Если вариантов нет - options должен быть пустым объектом {}
- НЕ используй \\text{} для обычного текста`;

  /**
   * Add log for frontend
   */
  private static addLog(level: ParseLog['level'], message: string, keyIndex?: number): void {
    const log: ParseLog = {
      timestamp: Date.now(),
      level,
      message,
      keyIndex,
    };
    this.currentLogs.push(log);
    console.log(`[${level.toUpperCase()}] ${message}`);
  }

  /**
   * Get and clear logs
   */
  static getAndClearLogs(): ParseLog[] {
    const logs = [...this.currentLogs];
    this.currentLogs = [];
    return logs;
  }

  /**
   * Initialize API keys from environment
   */
  private static initializeKeys(): void {
    if (this.apiKeys.length > 0) return;

    const keysString = process.env.GROQ_API_KEY;
    if (!keysString) {
      this.addLog('warning', '⚠️ GROQ_API_KEY not found in .env');
      return;
    }

    this.apiKeys = keysString
      .split(',')
      .map(key => key.trim())
      .filter(key => key.length > 0);

    this.addLog('success', `✅ Loaded ${this.apiKeys.length} Groq API key(s)`);
    
    this.apiKeys.forEach((key, index) => {
      this.keyStatuses.set(key, {
        key,
        index: index + 1,
        isAvailable: true,
        usageCount: 0,
        lastError: null,
        lastSuccess: null,
        consecutiveErrors: 0,
        rateLimitUntil: null,
      });
    });
  }

  /**
   * Get best available API key
   */
  private static getBestAvailableKey(): string | null {
    this.initializeKeys();

    if (this.apiKeys.length === 0) {
      return null;
    }

    const now = Date.now();
    const availableKeys: KeyStatus[] = [];

    for (const status of this.keyStatuses.values()) {
      if (status.rateLimitUntil && now < status.rateLimitUntil) {
        const remainingTime = Math.ceil((status.rateLimitUntil - now) / 1000);
        this.addLog('warning', `⏳ Key #${status.index} in rate limit cooldown (${remainingTime}s remaining)`, status.index);
        continue;
      }

      if (status.lastError && now - status.lastError < this.ERROR_COOLDOWN) {
        const remainingTime = Math.ceil((this.ERROR_COOLDOWN - (now - status.lastError)) / 1000);
        this.addLog('warning', `⏳ Key #${status.index} in error cooldown (${remainingTime}s remaining)`, status.index);
        continue;
      }

      if (status.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
        this.addLog('error', `❌ Key #${status.index} has too many consecutive errors (${status.consecutiveErrors})`, status.index);
        continue;
      }

      availableKeys.push(status);
    }

    if (availableKeys.length === 0) {
      this.addLog('error', '❌ No available API keys at the moment');
      return null;
    }

    availableKeys.sort((a, b) => {
      if (a.usageCount !== b.usageCount) {
        return a.usageCount - b.usageCount;
      }
      if (a.lastSuccess && b.lastSuccess) {
        return b.lastSuccess - a.lastSuccess;
      }
      return a.consecutiveErrors - b.consecutiveErrors;
    });

    const bestKey = availableKeys[0];
    this.addLog('info', `🔑 Selected Key #${bestKey.index} (used: ${bestKey.usageCount}, errors: ${bestKey.consecutiveErrors})`, bestKey.index);
    
    return bestKey.key;
  }

  /**
   * Mark key success
   */
  private static markKeySuccess(key: string): void {
    const status = this.keyStatuses.get(key);
    if (!status) return;

    status.usageCount++;
    status.lastSuccess = Date.now();
    status.consecutiveErrors = 0;
    status.rateLimitUntil = null;
    
    this.addLog('success', `✅ Key #${status.index} success (total: ${status.usageCount})`, status.index);
  }

  /**
   * Mark key error
   */
  private static markKeyError(key: string, isRateLimit: boolean): void {
    const status = this.keyStatuses.get(key);
    if (!status) return;

    status.lastError = Date.now();
    status.consecutiveErrors++;

    if (isRateLimit) {
      status.rateLimitUntil = Date.now() + this.RATE_LIMIT_COOLDOWN;
      this.addLog('warning', `⚠️ Key #${status.index} RATE LIMITED! Switching to next key... (cooldown: 60s)`, status.index);
    } else {
      this.addLog('warning', `⚠️ Key #${status.index} error (consecutive: ${status.consecutiveErrors})`, status.index);
    }
  }

  /**
   * Try API call with retries for specific key
   */
  private static async tryKeyWithRetries(
    text: string,
    model: string,
    key: string,
    maxRetries: number
  ): Promise<GroqQuestion[] | null> {
    const status = this.keyStatuses.get(key);
    if (!status) return null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.addLog('info', `🔄 Key #${status.index} attempt ${attempt}/${maxRetries}`, status.index);
        
        const result = await this.callGroqAPI(text, model, key);
        
        this.markKeySuccess(key);
        return result;
        
      } catch (error: any) {
        const isRateLimit = error.message.includes('429') || 
                           error.message.includes('rate limit') ||
                           error.message.includes('Rate limit');
        
        const errorMsg = error.message.substring(0, 100);
        this.addLog('error', `❌ Key #${status.index} attempt ${attempt}/${maxRetries} failed: ${errorMsg}`, status.index);
        
        if (attempt === maxRetries) {
          this.markKeyError(key, isRateLimit);
          return null;
        }
        
        if (isRateLimit) {
          this.addLog('warning', `⚠️ Rate limit detected, skipping remaining retries for Key #${status.index}`, status.index);
          this.markKeyError(key, true);
          return null;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.addLog('info', `⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /**
   * Parse test text using Groq AI with smart key selection
   */
  static async parseTestWithAI(text: string): Promise<GroqQuestion[]> {
    this.initializeKeys();
    
    if (this.apiKeys.length === 0) {
      console.warn('⚠️ No Groq API keys available, skipping AI parsing');
      return [];
    }

    console.log(`🤖 Starting AI parsing with ${this.apiKeys.length} available keys...`);
    console.log(`📝 Input text length: ${text.length} characters`);
    console.log(`📝 Input text preview (first 500 chars):\n${text.substring(0, 500)}`);
    
    this.addLog('info', `🤖 Starting AI parsing with ${this.apiKeys.length} available keys...`);
    this.addLog('info', `📝 Input text: ${text.length} characters`);

    try {
      // Try with Meta model first
      console.log('📊 Trying fast model (llama-3.1-8b-instant)...');
      this.addLog('info', '📊 Trying fast model (llama-3.1-8b-instant)...');
      const result = await this.parseWithBestKey(text, this.META_MODEL);
      
      if (this.isValidResult(result)) {
        console.log(`✅ Successfully parsed ${result.length} questions with fast model`);
        this.addLog('success', `✅ Successfully parsed ${result.length} questions with fast model`);
        return result;
      }
      
      console.log('⚠️ Fast model result invalid, trying powerful model...');
      this.addLog('warning', '⚠️ Fast model result invalid, trying powerful model...');
      
      // Fallback to powerful model
      console.log('📊 Trying powerful model (llama-3.3-70b-versatile)...');
      this.addLog('info', '📊 Trying powerful model (llama-3.3-70b-versatile)...');
      const fallbackResult = await this.parseWithBestKey(text, this.FALLBACK_MODEL);
      
      if (this.isValidResult(fallbackResult)) {
        console.log(`✅ Successfully parsed ${fallbackResult.length} questions with powerful model`);
        this.addLog('success', `✅ Successfully parsed ${fallbackResult.length} questions with powerful model`);
        return fallbackResult;
      }
      
      console.log('❌ Both models failed, returning empty array');
      this.addLog('error', '❌ Both models failed to parse the test');
      return [];
      
    } catch (error: any) {
      console.error('Error parsing with Groq AI:', error.message);
      this.addLog('error', `❌ Error: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse with best available key, trying all keys if needed
   */
  private static async parseWithBestKey(text: string, model: string): Promise<GroqQuestion[]> {
    const maxKeyAttempts = this.apiKeys.length;
    
    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      const key = this.getBestAvailableKey();
      
      if (!key) {
        this.addLog('warning', '⏳ No keys available, waiting 5s...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      const result = await this.tryKeyWithRetries(text, model, key, this.MAX_RETRIES_PER_KEY);
      
      if (result) {
        return result;
      }
      
      this.addLog('warning', `⚠️ Key failed after retries, trying next key (${keyAttempt + 1}/${maxKeyAttempts})...`);
    }

    this.addLog('error', '❌ All keys exhausted');
    return [];
  }

  /**
   * Call Groq API
   */
  private static async callGroqAPI(text: string, model: string, apiKey: string): Promise<GroqQuestion[]> {
    const response = await fetch(this.GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: this.SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Groq response');
    }

    console.log('📄 AI Response (first 1000 chars):', content.substring(0, 1000));
    this.addLog('info', `📄 AI returned response (${content.length} chars)`);

    const parsed: GroqResponse = JSON.parse(content);
    const questions = parsed.questions || [];
    
    console.log(`📊 Parsed ${questions.length} questions from AI response`);
    this.addLog('info', `📊 Parsed ${questions.length} questions from JSON`);
    
    return questions;
  }

  /**
   * Validate AI result
   */
  private static isValidResult(questions: GroqQuestion[]): boolean {
    if (!questions || questions.length === 0) {
      console.log('❌ Validation failed: No questions');
      this.addLog('error', '❌ Validation failed: No questions returned by AI');
      return false;
    }

    console.log(`🔍 Validating ${questions.length} questions...`);
    this.addLog('info', `🔍 Validating ${questions.length} questions from AI response`);

    // Проверяем что хотя бы есть текст вопроса
    for (const q of questions) {
      if (!q.text || q.text.trim() === '') {
        const msg = `❌ Validation failed: Question ${q.number} has no text`;
        console.log(msg);
        this.addLog('error', msg);
        console.log('Question data:', JSON.stringify(q, null, 2));
        return false;
      }

      // If there are options, check they're not empty
      if (q.options && Object.keys(q.options).length > 0) {
        for (const [key, value] of Object.entries(q.options)) {
          const text = typeof value === 'string' ? value : (value as any).text;
          if (!text || text.trim() === '' || text.trim() === '_______________') {
            console.log(`Question ${q.number}: removing empty option ${key}`);
            delete (q.options as any)[key];
          }
        }
      }
    }

    console.log(`✅ Validation passed: ${questions.length} questions`);
    this.addLog('success', `✅ Validation passed: ${questions.length} questions are valid`);
    return true;
  }

  /**
   * Convert Groq questions to our format
   */
  static convertToOurFormat(groqQuestions: GroqQuestion[]): any[] {
    return groqQuestions.map(q => {
      // Исправляем неправильное экранирование в тексте вопроса
      let questionText = q.text;
      questionText = this.fixLatexEscaping(questionText);
      
      // Process answer options
      const variants = q.options && Object.keys(q.options).length > 0
        ? Object.entries(q.options).map(([letter, option]) => {
            // Support both string and object
            const text = typeof option === 'string' ? option : (option as any).text;
            
            // Fix escaping
            const fixedText = this.fixLatexEscaping(text);
            
            return {
              letter: letter.toUpperCase(),
              text: fixedText,
            };
          })
        : []; // Empty array if no options

      return {
        text: questionText,
        variants,
        correctAnswer: variants.length > 0 ? 'A' : '', // Пустой если нет вариантов
        points: 1,
      };
    });
  }

  /**
   * Fix LaTeX escaping issues from AI
   */
  private static fixLatexEscaping(text: string): string {
    if (!text) return text;
    
    let fixed = text;
    
    // Убираем \text{} вокруг обычного текста (AI иногда добавляет это)
    fixed = fixed.replace(/\\text\{([^}]+)\}/g, '$1');
    
    // Если уже правильно экранировано - не трогаем
    if (fixed.includes('\\\\(') || fixed.includes('\\\\[')) {
      return fixed;
    }
    
    // Исправляем одинарные слеши на двойные для LaTeX разделителей
    // \( ... \) → \\( ... \\)
    fixed = fixed.replace(/\\(\()/g, '\\\\$1');
    fixed = fixed.replace(/\\(\))/g, '\\\\$1');
    
    // \[ ... \] → \\[ ... \\]
    fixed = fixed.replace(/\\(\[)/g, '\\\\$1');
    fixed = fixed.replace(/\\(\])/g, '\\\\$1');
    
    // Исправляем LaTeX команды внутри формул
    const latexCommands = [
      'leq', 'geq', 'neq', 'times', 'div', 'pm', 'mp',
      'sqrt', 'frac', 'sum', 'prod', 'int',
      'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'sigma',
      'sin', 'cos', 'tan', 'log', 'ln', 'exp',
      'left', 'right', 'cdot', 'ldots'
    ];
    
    for (const cmd of latexCommands) {
      const regex = new RegExp(`(?<!\\\\)\\\\(${cmd})`, 'g');
      fixed = fixed.replace(regex, '\\\\$1');
    }
    
    return fixed;
  }

  /**
   * Get detailed statistics about all keys
   */
  static getDetailedStats(): any[] {
    this.initializeKeys();
    const now = Date.now();
    
    return Array.from(this.keyStatuses.values()).map(status => ({
      keyIndex: status.index,
      isAvailable: status.isAvailable,
      usageCount: status.usageCount,
      consecutiveErrors: status.consecutiveErrors,
      lastSuccess: status.lastSuccess ? new Date(status.lastSuccess).toISOString() : null,
      lastError: status.lastError ? new Date(status.lastError).toISOString() : null,
      rateLimitUntil: status.rateLimitUntil ? new Date(status.rateLimitUntil).toISOString() : null,
      rateLimitRemaining: status.rateLimitUntil ? Math.max(0, Math.ceil((status.rateLimitUntil - now) / 1000)) : 0,
    }));
  }

  /**
   * Reset all key statistics (for testing)
   */
  static resetStats(): void {
    for (const status of this.keyStatuses.values()) {
      status.usageCount = 0;
      status.consecutiveErrors = 0;
      status.lastError = null;
      status.lastSuccess = null;
      status.rateLimitUntil = null;
    }
    console.log('🔄 All key statistics reset');
  }
}
