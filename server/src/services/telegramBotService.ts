import TelegramBot from 'node-telegram-bot-api';
import Student from '../models/Student';
import { logger } from '../config/logger';

class TelegramBotServiceClass {
  private bot: TelegramBot | null = null;

  init(): void {
    if (process.env.TELEGRAM_ENABLED !== 'true') {
      logger.info('Telegram bot disabled (TELEGRAM_ENABLED != true)', 'TELEGRAM');
      return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      logger.warn('TELEGRAM_BOT_TOKEN not set, bot disabled', 'TELEGRAM');
      return;
    }

    this.bot = new TelegramBot(token, { polling: true });
    this.registerHandlers();
    logger.info('Telegram bot started (polling)', 'TELEGRAM');
  }

  private registerHandlers(): void {
    if (!this.bot) return;

    this.bot.onText(/\/start/, (msg) => {
      this.bot!.sendMessage(
        msg.chat.id,
        "Assalomu alaykum! ResultMA botiga xush kelibsiz.\n\n" +
          "O'z kodingizni yuboring (5 xonali raqam).\nMasalan: 12345"
      );
    });

    this.bot.onText(/^\d{5}$/, async (msg) => {
      const chatId = msg.chat.id;
      const code = parseInt(msg.text!, 10);

      try {
        const alreadyLinked = await Student.findOne({ telegramChatId: chatId }).lean();
        if (alreadyLinked) {
          this.bot!.sendMessage(
            chatId,
            `Siz allaqachon ${alreadyLinked.fullName} sifatida ro'yxatdan o'tgansiz.\n` +
              `Boshqa akkauntga ulash uchun /unlink buyrug'ini yuboring.`
          );
          return;
        }

        const student = await Student.findOne({ studentCode: code, isActive: true });
        if (!student) {
          this.bot!.sendMessage(chatId, "Bu kod bilan o'quvchi topilmadi. Kodni tekshirib qaytadan yuboring.");
          return;
        }

        if (student.telegramChatId && student.telegramChatId !== chatId) {
          this.bot!.sendMessage(chatId, 'Bu kod boshqa Telegram hisobiga ulangan.');
          return;
        }

        student.telegramChatId = chatId;
        await student.save();

        this.bot!.sendMessage(
          chatId,
          `Muvaffaqiyatli ulandi!\n\nIsm: ${student.fullName}\nKod: ${student.studentCode}\n\n` +
            `Endi test natijalari avtomatik yuboriladi.`
        );
        logger.info(`Student ${student.fullName} linked to Telegram chatId ${chatId}`, 'TELEGRAM');
      } catch (error) {
        logger.error(
          'Error linking student',
          error instanceof Error ? error : new Error(String(error)),
          'TELEGRAM'
        );
        this.bot!.sendMessage(chatId, "Xatolik yuz berdi. Qaytadan urinib ko'ring.");
      }
    });

    this.bot.onText(/\/unlink/, async (msg) => {
      const chatId = msg.chat.id;
      const student = await Student.findOne({ telegramChatId: chatId });
      if (!student) {
        this.bot!.sendMessage(chatId, "Sizning hisobingiz hech qanday o'quvchiga ulanmagan.");
        return;
      }
      student.telegramChatId = undefined;
      await student.save();
      this.bot!.sendMessage(chatId, `${student.fullName} dan uzildi. Yangi kod yuborishingiz mumkin.`);
    });

    this.bot.onText(/\/me/, async (msg) => {
      const chatId = msg.chat.id;
      const student = await Student.findOne({ telegramChatId: chatId }).lean();
      if (!student) {
        this.bot!.sendMessage(chatId, "Siz hali ro'yxatdan o'tmagansiz. Kodingizni yuboring.");
        return;
      }
      this.bot!.sendMessage(
        chatId,
        `Ism: ${student.fullName}\nKod: ${student.studentCode}\nSinf: ${student.classNumber}`
      );
    });

    this.bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/') && !/^\d{5}$/.test(msg.text)) {
        this.bot!.sendMessage(msg.chat.id, "5 xonali kodingizni yuboring yoki /start bosing.");
      }
    });

    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error', error, 'TELEGRAM');
    });
  }

  async sendResultNotification(
    studentId: string,
    resultData: {
      testName: string;
      totalPoints: number;
      maxPoints: number;
      percentage: number;
      correct: number;
      incorrect: number;
    }
  ): Promise<void> {
    if (!this.bot) return;

    try {
      const student = await Student.findById(studentId).select('telegramChatId fullName').lean();
      if (!student?.telegramChatId) return;

      const emoji = resultData.percentage >= 80 ? '🟢' : resultData.percentage >= 50 ? '🟡' : '🔴';

      const message =
        `📝 Test natijasi\n\n` +
        `Test: ${resultData.testName}\n` +
        `${emoji} Ball: ${resultData.totalPoints}/${resultData.maxPoints} (${resultData.percentage}%)\n` +
        `✅ To'g'ri: ${resultData.correct}\n` +
        `❌ Xato: ${resultData.incorrect}`;

      await this.bot.sendMessage(student.telegramChatId, message);
    } catch (error) {
      logger.error(
        'Failed to send Telegram notification',
        error instanceof Error ? error : new Error(String(error)),
        'TELEGRAM'
      );
    }
  }

  stop(): void {
    if (this.bot) {
      this.bot.stopPolling();
      logger.info('Telegram bot stopped', 'TELEGRAM');
    }
  }
}

export const TelegramBotService = new TelegramBotServiceClass();
