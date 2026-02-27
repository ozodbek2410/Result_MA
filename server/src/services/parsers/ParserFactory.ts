import { SmartUniversalParser } from './SmartUniversalParser';

/**
 * Parser Factory - SmartUniversalParser (auto-detect)
 * Fan tanlash shart emas — parser o'zi aniqlaydi
 */
export class ParserFactory {
  static getParser(_subjectId?: string): SmartUniversalParser {
    console.log('🧠 [FACTORY] Using SmartUniversalParser (auto-detect)');
    return new SmartUniversalParser();
  }

  static createParser(_subjectName?: string): SmartUniversalParser {
    return new SmartUniversalParser();
  }

  static isSubjectSupported(_subjectName: string): boolean {
    return true;
  }
}
