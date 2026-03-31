import TelegramBot from 'node-telegram-bot-api';
import Student from '../models/Student';
import StudentGroup from '../models/StudentGroup';
import TestResult from '../models/TestResult';
import BlockTest from '../models/BlockTest';
import Test from '../models/Test';
import { logger } from '../config/logger';

const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

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

    // /start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const student = await Student.findOne({ telegramChatId: chatId }).lean();
      if (student) {
        await this.showMainMenu(chatId, student);
        return;
      }
      this.bot!.sendMessage(
        chatId,
        "Assalomu alaykum! ResultMA botiga xush kelibsiz.\n\n" +
          "O'z kodingizni yuboring (5 xonali raqam).\nMasalan: 12345"
      );
    });

    // 5-digit student code
    this.bot.onText(/^\d{5}$/, async (msg) => {
      const chatId = msg.chat.id;
      const code = parseInt(msg.text!, 10);

      try {
        const alreadyLinked = await Student.findOne({ telegramChatId: chatId }).lean();
        if (alreadyLinked) {
          await this.showMainMenu(chatId, alreadyLinked);
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

        logger.info(`Student ${student.fullName} linked to Telegram chatId ${chatId}`, 'TELEGRAM');
        await this.showMainMenu(chatId, student.toObject());
      } catch (error) {
        logger.error('Error linking student', error instanceof Error ? error : new Error(String(error)), 'TELEGRAM');
        this.bot!.sendMessage(chatId, "Xatolik yuz berdi. Qaytadan urinib ko'ring.");
      }
    });

    // /me command — show menu
    this.bot.onText(/\/me/, async (msg) => {
      const chatId = msg.chat.id;
      const student = await Student.findOne({ telegramChatId: chatId }).lean();
      if (!student) {
        this.bot!.sendMessage(chatId, "Siz hali ro'yxatdan o'tmagansiz. Kodingizni yuboring.");
        return;
      }
      await this.showMainMenu(chatId, student);
    });

    // Callback query handler (inline keyboard buttons)
    this.bot.on('callback_query', async (query) => {
      if (!query.data || !query.message) return;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      const data = query.data;

      try {
        const student = await Student.findOne({ telegramChatId: chatId }).lean();
        if (!student) {
          await this.bot!.answerCallbackQuery(query.id, { text: "Avval kodingizni yuboring" });
          return;
        }

        await this.bot!.answerCallbackQuery(query.id);

        if (data === 'overall') {
          await this.handleOverallStats(chatId, messageId, student);
        } else if (data.startsWith('subject:')) {
          const parts = data.split(':');
          const subjectId = parts[1];
          const subjectName = decodeURIComponent(parts[2]);
          await this.handleSubjectSelect(chatId, messageId, student, subjectId, subjectName);
        } else if (data.startsWith('month:')) {
          const parts = data.split(':');
          const subjectId = parts[1];
          const subjectName = decodeURIComponent(parts[2]);
          const month = parseInt(parts[3], 10);
          const year = parseInt(parts[4], 10);
          await this.handleMonthStats(chatId, messageId, student, subjectId, subjectName, month, year);
        } else if (data === 'back:main') {
          await this.showMainMenu(chatId, student, messageId);
        } else if (data.startsWith('back:subject:')) {
          const parts = data.split(':');
          const subjectId = parts[2];
          const subjectName = decodeURIComponent(parts[3]);
          await this.handleSubjectSelect(chatId, messageId, student, subjectId, subjectName);
        } else if (data === 'logout') {
          await this.handleLogout(chatId, messageId);
        }
      } catch (error) {
        logger.error('Callback query error', error instanceof Error ? error : new Error(String(error)), 'TELEGRAM');
      }
    });

    // Unknown messages
    this.bot.on('message', (msg) => {
      if (msg.text && !msg.text.startsWith('/') && !/^\d{5}$/.test(msg.text)) {
        this.bot!.sendMessage(msg.chat.id, "5 xonali kodingizni yuboring yoki /start bosing.");
      }
    });

    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error', error, 'TELEGRAM');
    });
  }

  // Show main menu with subject tabs
  private async showMainMenu(chatId: number, student: { _id?: unknown; fullName?: unknown; studentCode?: unknown; classNumber?: unknown }, editMessageId?: number): Promise<void> {
    if (!this.bot) return;

    // Get student's subjects from groups
    const subjects = await this.getStudentSubjects(String(student._id));

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];

    // Overall stats button (full width)
    keyboard.push([{ text: '📊 Umumiy natijam', callback_data: 'overall' }]);

    // Subject buttons (2 per row)
    for (let i = 0; i < subjects.length; i += 2) {
      const row: TelegramBot.InlineKeyboardButton[] = [];
      row.push({
        text: `📚 ${subjects[i].name}`,
        callback_data: `subject:${subjects[i].id}:${encodeURIComponent(subjects[i].name)}`
      });
      if (i + 1 < subjects.length) {
        row.push({
          text: `📚 ${subjects[i + 1].name}`,
          callback_data: `subject:${subjects[i + 1].id}:${encodeURIComponent(subjects[i + 1].name)}`
        });
      }
      keyboard.push(row);
    }

    // Logout button
    keyboard.push([{ text: '🚪 Chiqish', callback_data: 'logout' }]);

    const text = `👤 ${student.fullName}\n🆔 Kod: ${student.studentCode}\n🏫 Sinf: ${student.classNumber}\n\nQuyidagi bo'limlardan birini tanlang:`;

    const replyMarkup = { inline_keyboard: keyboard };

    if (editMessageId) {
      await this.bot.editMessageText(text, { chat_id: chatId, message_id: editMessageId, parse_mode: 'HTML', reply_markup: replyMarkup });
    } else {
      await this.bot.sendMessage(chatId, text, { parse_mode: 'HTML', reply_markup: replyMarkup });
    }
  }

  // Overall statistics
  private async handleOverallStats(chatId: number, messageId: number, student: { _id?: unknown; fullName?: unknown }): Promise<void> {
    if (!this.bot) return;

    const studentId = String(student._id);
    const results = await TestResult.find({ studentId })
      .populate('testId', 'name subjectId')
      .populate('blockTestId', 'periodMonth periodYear classNumber')
      .sort({ createdAt: -1 })
      .lean();

    if (results.length === 0) {
      await this.bot.editMessageText(
        `📊 <b>Umumiy natijalar</b>\n\n${String(student.fullName)}\n\nHali test natijalari yo'q.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'back:main' }]] }
        }
      );
      return;
    }

    const avgPercentage = Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length);
    const maxResult = Math.max(...results.map(r => r.percentage));
    const totalTests = results.length;

    // Last 5 results
    const recent = results.slice(0, 5);
    let recentText = '';
    for (const r of recent) {
      const testInfo = r.testId as unknown as { name?: string } | null;
      const btInfo = r.blockTestId as unknown as { periodMonth?: number; periodYear?: number } | null;
      let name = 'Test';
      if (testInfo && testInfo.name) name = testInfo.name;
      else if (btInfo) name = `Blok test ${btInfo.periodMonth}/${btInfo.periodYear}`;

      const emoji = r.percentage >= 80 ? '🟢' : r.percentage >= 50 ? '🟡' : '🔴';
      recentText += `${emoji} ${name} — ${r.percentage}% (${r.totalPoints}/${r.maxPoints})\n`;
    }

    const text =
      `📊 <b>Umumiy natijalar</b>\n\n` +
      `👤 ${String(student.fullName)}\n` +
      `📝 Jami testlar: <b>${totalTests}</b>\n` +
      `📈 O'rtacha: <b>${avgPercentage}%</b>\n` +
      `🏆 Eng yuqori: <b>${maxResult}%</b>\n\n` +
      `<b>Oxirgi natijalar:</b>\n${recentText}`;

    await this.bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'back:main' }]] }
    });
  }

  // Subject selected — show available months
  private async handleSubjectSelect(
    chatId: number, messageId: number, student: { _id?: unknown },
    subjectId: string, subjectName: string
  ): Promise<void> {
    if (!this.bot) return;

    const studentId = String(student._id);

    // Find block tests with this subject that have results for this student
    const blockTestResults = await TestResult.find({ studentId, blockTestId: { $exists: true, $ne: null } })
      .populate({
        path: 'blockTestId',
        select: 'periodMonth periodYear subjectTests',
        match: { 'subjectTests.subjectId': subjectId }
      })
      .lean();

    // Also find regular tests with this subject
    const testResults = await TestResult.find({ studentId, testId: { $exists: true, $ne: null } })
      .populate({
        path: 'testId',
        select: 'subjectId name',
        match: { subjectId }
      })
      .lean();

    // Collect available months from block tests
    const monthsSet = new Map<string, { month: number; year: number }>();

    for (const r of blockTestResults) {
      const bt = r.blockTestId as unknown as { periodMonth?: number; periodYear?: number } | null;
      if (bt && bt.periodMonth && bt.periodYear) {
        const key = `${bt.periodYear}-${bt.periodMonth}`;
        monthsSet.set(key, { month: bt.periodMonth, year: bt.periodYear });
      }
    }

    // For regular tests, use createdAt month
    for (const r of testResults) {
      if (r.testId) {
        const date = new Date(r.createdAt);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const key = `${year}-${month}`;
        monthsSet.set(key, { month, year });
      }
    }

    const months = Array.from(monthsSet.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );

    if (months.length === 0) {
      await this.bot.editMessageText(
        `📚 <b>${subjectName}</b>\n\nBu fan bo'yicha natijalar topilmadi.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: 'back:main' }]] }
        }
      );
      return;
    }

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    for (let i = 0; i < months.length; i += 2) {
      const row: TelegramBot.InlineKeyboardButton[] = [];
      const m = months[i];
      row.push({
        text: `📅 ${MONTHS[m.month - 1]} ${m.year}`,
        callback_data: `month:${subjectId}:${encodeURIComponent(subjectName)}:${m.month}:${m.year}`
      });
      if (i + 1 < months.length) {
        const m2 = months[i + 1];
        row.push({
          text: `📅 ${MONTHS[m2.month - 1]} ${m2.year}`,
          callback_data: `month:${subjectId}:${encodeURIComponent(subjectName)}:${m2.month}:${m2.year}`
        });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: '⬅️ Orqaga', callback_data: 'back:main' }]);

    await this.bot.editMessageText(
      `📚 <b>${subjectName}</b>\n\nOy tanlang:`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard }
      }
    );
  }

  // Month stats for a subject
  private async handleMonthStats(
    chatId: number, messageId: number, student: { _id?: unknown },
    subjectId: string, subjectName: string, month: number, year: number
  ): Promise<void> {
    if (!this.bot) return;

    const studentId = String(student._id);

    // Block test results for this month
    const blockTests = await BlockTest.find({
      periodMonth: month,
      periodYear: year,
      'subjectTests.subjectId': subjectId
    }).select('_id').lean();

    const blockTestIds = blockTests.map(bt => bt._id);

    const btResults = blockTestIds.length > 0
      ? await TestResult.find({ studentId, blockTestId: { $in: blockTestIds } }).lean()
      : [];

    // Regular test results for this month
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);

    const regularTests = await Test.find({ subjectId }).select('_id').lean();
    const regularTestIds = regularTests.map(t => t._id);

    const testResults = regularTestIds.length > 0
      ? await TestResult.find({
          studentId,
          testId: { $in: regularTestIds },
          createdAt: { $gte: monthStart, $lt: monthEnd }
        }).lean()
      : [];

    const allResults = [...btResults, ...testResults];

    if (allResults.length === 0) {
      await this.bot.editMessageText(
        `📚 <b>${subjectName}</b> — ${MONTHS[month - 1]} ${year}\n\nBu oyda natijalar topilmadi.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Orqaga', callback_data: `back:subject:${subjectId}:${encodeURIComponent(subjectName)}` }]] }
        }
      );
      return;
    }

    const avgPercentage = Math.round(allResults.reduce((sum, r) => sum + r.percentage, 0) / allResults.length);
    const maxResult = Math.max(...allResults.map(r => r.percentage));
    const totalCorrect = allResults.reduce((sum, r) => sum + r.answers.filter(a => a.isCorrect).length, 0);
    const totalQuestions = allResults.reduce((sum, r) => sum + r.answers.length, 0);

    let resultsText = '';
    for (const r of allResults) {
      const emoji = r.percentage >= 80 ? '🟢' : r.percentage >= 50 ? '🟡' : '🔴';
      const correct = r.answers.filter(a => a.isCorrect).length;
      const total = r.answers.length;
      resultsText += `${emoji} ${r.totalPoints}/${r.maxPoints} ball (${r.percentage}%) — ${correct}/${total} to'g'ri\n`;
    }

    const text =
      `📚 <b>${subjectName}</b> — ${MONTHS[month - 1]} ${year}\n\n` +
      `📝 Testlar soni: <b>${allResults.length}</b>\n` +
      `📈 O'rtacha: <b>${avgPercentage}%</b>\n` +
      `🏆 Eng yuqori: <b>${maxResult}%</b>\n` +
      `✅ Jami to'g'ri: <b>${totalCorrect}/${totalQuestions}</b>\n\n` +
      `<b>Natijalar:</b>\n${resultsText}`;

    await this.bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⬅️ Orqaga', callback_data: `back:subject:${subjectId}:${encodeURIComponent(subjectName)}` }],
          [{ text: '🏠 Bosh menyu', callback_data: 'back:main' }]
        ]
      }
    });
  }

  // Logout
  private async handleLogout(chatId: number, messageId: number): Promise<void> {
    if (!this.bot) return;

    const student = await Student.findOne({ telegramChatId: chatId });
    if (student) {
      student.telegramChatId = undefined;
      await student.save();
    }

    await this.bot.editMessageText(
      "🚪 Profildan chiqdingiz.\n\nQayta kirish uchun 5 xonali kodingizni yuboring.",
      { chat_id: chatId, message_id: messageId }
    );
  }

  // Get student subjects from groups
  private async getStudentSubjects(studentId: string): Promise<Array<{ id: string; name: string }>> {
    const groups = await StudentGroup.find({ studentId })
      .populate({
        path: 'groupId',
        select: 'subjectId',
        populate: { path: 'subjectId', select: 'nameUzb' }
      })
      .lean();

    const subjectMap = new Map<string, string>();
    for (const sg of groups) {
      const group = sg.groupId as unknown as { subjectId?: { _id?: unknown; nameUzb?: string } } | null;
      if (!group) continue;
      const subject = group.subjectId;
      if (subject && subject._id && subject.nameUzb) {
        subjectMap.set(String(subject._id), subject.nameUzb);
      }
    }

    return Array.from(subjectMap.entries()).map(([id, name]) => ({ id, name }));
  }

  // Send result notification (called from TestResult post-save hook)
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
      logger.error('Failed to send Telegram notification', error instanceof Error ? error : new Error(String(error)), 'TELEGRAM');
    }
  }

  /**
   * Blok test tugaganda barcha o'quvchilarga natija jadvalini rasm sifatida yuborish.
   * SVG → PNG (sharp) → Telegram sendPhoto
   */
  async sendBlockTestSummary(blockTestId: string): Promise<void> {
    if (!this.bot) return;

    try {
      const Subject = (await import('../models/Subject')).default;

      const bt = await BlockTest.findById(blockTestId).lean();
      if (!bt) return;

      // Fanlar ro'yxati + savol soni
      const subjectIds = [...new Set(bt.subjectTests.map((s: { subjectId: { toString: () => string } }) => s.subjectId.toString()))];
      const subjects = await Subject.find({ _id: { $in: subjectIds } }).select('nameUzb').lean();
      const subjectMap = new Map(subjects.map(s => [s._id.toString(), s.nameUzb]));
      const subjectNames = subjectIds.map(id => subjectMap.get(id) || 'Fan');

      // Har fan uchun savol sonini aniqlash (birinchi studentdan)
      const firstConfig = bt.studentConfigs?.[0];
      const subjectQCounts = subjectIds.map(sid => {
        const sc = firstConfig?.subjects?.find((s: { subjectId: { toString: () => string }; questionCount: number }) => s.subjectId.toString() === sid);
        return sc?.questionCount || 0;
      });

      // Guruh nomi
      const Group = (await import('../models/Group')).default;
      const group = bt.groupId ? await Group.findById(bt.groupId).select('name letter').lean() : null;
      const groupName = group?.name || `${bt.classNumber}-sinf`;

      // Barcha natijalar
      const results = await TestResult.find({ blockTestId }).populate('studentId', 'fullName telegramChatId').lean();
      if (results.length === 0) return;

      // StudentConfigs — har student uchun fan bo'yicha savol soni
      const configMap = new Map<string, Map<string, number>>();
      for (const sc of bt.studentConfigs || []) {
        const subjMap = new Map<string, number>();
        for (const subj of sc.subjects) {
          subjMap.set(subj.subjectId.toString(), subj.questionCount);
        }
        configMap.set(sc.studentId.toString(), subjMap);
      }

      // Natijalarni jadval formatiga
      interface RowData {
        name: string;
        chatId?: number;
        subjectScores: { correct: number; total: number }[];
        totalCorrect: number;
        totalQuestions: number;
        percentage: number;
      }

      const rows: RowData[] = [];
      for (const r of results) {
        const student = r.studentId as unknown as { _id: { toString: () => string }; fullName: string; telegramChatId?: number };
        if (!student?.fullName) continue;

        const studentId = student._id.toString();
        const sConfig = configMap.get(studentId);

        // Fan bo'yicha natijalarni hisoblash
        let qIdx = 0;
        const subjectScores: { correct: number; total: number }[] = [];
        let totalCorr = 0;
        let totalQ = 0;

        for (const sid of subjectIds) {
          const qCount = sConfig?.get(sid) || 0;
          let correct = 0;
          for (let i = 0; i < qCount; i++) {
            const ans = r.answers[qIdx + i];
            if (ans?.isCorrect) correct++;
          }
          subjectScores.push({ correct, total: qCount });
          totalCorr += correct;
          totalQ += qCount;
          qIdx += qCount;
        }

        rows.push({
          name: student.fullName,
          chatId: student.telegramChatId,
          subjectScores,
          totalCorrect: totalCorr,
          totalQuestions: totalQ,
          percentage: totalQ > 0 ? Math.round((totalCorr / totalQ) * 100) : 0,
        });
      }

      // Percentge bo'yicha tartiblash (yuqoridan pastga)
      rows.sort((a, b) => b.percentage - a.percentage);

      // SVG jadval yaratish
      const title = `Blok test natijalar — ${bt.classNumber}-sinf | ${groupName} | ${(bt.periodMonth || 1)}/${bt.periodYear}`;
      const svgBuffer = this.generateResultsSVG(title, subjectNames, subjectQCounts, rows);

      // Sharp bilan PNG ga aylantirish
      const sharp = (await import('sharp')).default;
      const pngBuffer = await sharp(svgBuffer).png().toBuffer();

      // Har bir o'quvchiga yuborish
      let sent = 0;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        if (!row.chatId) continue;
        try {
          const rank = ri + 1;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;
          const emoji = row.percentage >= 80 ? '🟢' : row.percentage >= 50 ? '🟡' : '🔴';

          // Fan bo'yicha natijalar
          const subjectLines = subjectNames.map((sn, si) => {
            const sc = row.subjectScores[si];
            const pct = sc.total > 0 ? Math.round((sc.correct / sc.total) * 100) : 0;
            const se = pct >= 80 ? '✅' : pct >= 50 ? '🔸' : '❌';
            return `  ${se} ${sn}: ${sc.correct}/${sc.total} (${pct}%)`;
          }).join('\n');

          const caption = `📊 ${title}\n\n` +
            `👤 ${row.name}\n` +
            `${emoji} Jami: ${row.totalCorrect}/${row.totalQuestions} (${row.percentage}%)\n` +
            `🏆 O'rin: ${medal}/${rows.length}\n\n` +
            `📚 Fan bo'yicha:\n${subjectLines}`;

          await this.bot.sendPhoto(row.chatId, pngBuffer, { caption });
          sent++;

          // Rate limit — 30 msg/sec Telegram limit
          if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1100));
        } catch {
          // Individual send failure — davom et
        }
      }

      logger.info(`Block test summary sent to ${sent}/${rows.length} students`, 'TELEGRAM');
    } catch (error) {
      logger.error('Block test summary error', error instanceof Error ? error : new Error(String(error)), 'TELEGRAM');
    }
  }

  /** SVG jadval — Real Excel ko'rinishida (rang gradient, savol soni) */
  generateResultsSVG(
    title: string,
    subjectNames: string[],
    subjectQCounts: number[],
    rows: { name: string; subjectScores: { correct: number; total: number }[]; totalCorrect: number; totalQuestions: number; percentage: number }[]
  ): Buffer {
    const nSubj = subjectNames.length;
    const numW = 32;
    const nameW = 200;
    const colW = Math.max(80, Math.floor(600 / nSubj));
    const totalW = 70;
    const pctW = 55;
    const rowH = 32;
    const headerH = 48;

    const tableW = numW + nameW + nSubj * colW + totalW + pctW;
    const pad = 16;
    const titleH = 44;
    const svgW = tableW + pad * 2;
    const svgH = titleH + headerH + rows.length * rowH + pad * 2 + 4;

    // Row background ranglar (gradient: yashil → sariq → qizil)
    const rowBg = (pct: number, idx: number): string => {
      if (pct >= 85) return '#c6efce';       // yashil
      if (pct >= 75) return '#d4edbc';       // och yashil
      if (pct >= 65) return '#e2f0b6';       // sariq-yashil
      if (pct >= 55) return '#fff2cc';       // sariq
      if (pct >= 45) return '#fce4d6';       // och qizil
      if (pct >= 30) return '#f8cbad';       // qizil
      if (pct > 0) return '#f4b084';         // to'q qizil
      return idx % 2 === 0 ? '#f2f2f2' : '#ffffff';
    };

    // Cell rang (fan natijasi uchun)
    const cellBg = (correct: number, total: number): string => {
      if (total === 0) return 'transparent';
      const pct = (correct / total) * 100;
      if (pct >= 80) return '#c6efce';
      if (pct >= 60) return '#e2f0b6';
      if (pct >= 40) return '#fff2cc';
      if (pct >= 20) return '#fce4d6';
      return '#f4b084';
    };

    const textColor = (pct: number): string => {
      if (pct >= 80) return '#006100';
      if (pct >= 50) return '#9c5700';
      return '#9c0006';
    };

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
<style>
  text{font-family:Segoe UI,Arial,sans-serif}
  .t{font-size:15px;font-weight:700;fill:#1f3864}
  .h{font-size:11px;font-weight:700;fill:#fff}
  .hs{font-size:9px;fill:#d0d8ff}
  .c{font-size:11px;fill:#333}
  .cb{font-size:12px;font-weight:700}
  .n{font-size:11px;fill:#555}
</style>
<rect width="${svgW}" height="${svgH}" fill="#fff" rx="6"/>
<text x="${svgW / 2}" y="${pad + 18}" text-anchor="middle" class="t">${this.escSvg(title)}</text>`;

    const tX = pad, tY = titleH + pad;

    // ═══ HEADER ═══
    svg += `<rect x="${tX}" y="${tY}" width="${tableW}" height="${headerH}" fill="#1f3864"/>`;
    let hx = tX;
    svg += `<text x="${hx + numW / 2}" y="${tY + 20}" text-anchor="middle" class="h">\u2116</text>`;
    hx += numW;
    svg += `<line x1="${hx}" y1="${tY + 4}" x2="${hx}" y2="${tY + headerH - 4}" stroke="#3a5090" stroke-width="1"/>`;
    svg += `<text x="${hx + nameW / 2}" y="${tY + 20}" text-anchor="middle" class="h">F.I.O</text>`;
    hx += nameW;

    for (let si = 0; si < nSubj; si++) {
      svg += `<line x1="${hx}" y1="${tY + 4}" x2="${hx}" y2="${tY + headerH - 4}" stroke="#3a5090" stroke-width="1"/>`;
      const sn = subjectNames[si].length > 12 ? subjectNames[si].substring(0, 11) + '.' : subjectNames[si];
      svg += `<text x="${hx + colW / 2}" y="${tY + 18}" text-anchor="middle" class="h">${this.escSvg(sn)}</text>`;
      if (subjectQCounts[si] > 0) {
        svg += `<text x="${hx + colW / 2}" y="${tY + 34}" text-anchor="middle" class="hs">(${subjectQCounts[si]} ta)</text>`;
      }
      hx += colW;
    }
    svg += `<line x1="${hx}" y1="${tY + 4}" x2="${hx}" y2="${tY + headerH - 4}" stroke="#3a5090" stroke-width="1"/>`;
    svg += `<text x="${hx + totalW / 2}" y="${tY + 20}" text-anchor="middle" class="h">Jami ball</text>`;
    hx += totalW;
    svg += `<line x1="${hx}" y1="${tY + 4}" x2="${hx}" y2="${tY + headerH - 4}" stroke="#3a5090" stroke-width="1"/>`;
    svg += `<text x="${hx + pctW / 2}" y="${tY + 20}" text-anchor="middle" class="h">Foiz (%)</text>`;

    // ═══ DATA ROWS ═══
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const ry = tY + headerH + i * rowH;
      const bg = rowBg(r.percentage, i);

      svg += `<rect x="${tX}" y="${ry}" width="${tableW}" height="${rowH}" fill="${bg}"/>`;
      svg += `<line x1="${tX}" y1="${ry + rowH}" x2="${tX + tableW}" y2="${ry + rowH}" stroke="#c0c0c0" stroke-width="0.5"/>`;

      let cx = tX;
      // #
      svg += `<text x="${cx + numW / 2}" y="${ry + 20}" text-anchor="middle" class="cb" fill="#1f3864">${i + 1}</text>`;
      cx += numW;
      svg += `<line x1="${cx}" y1="${ry}" x2="${cx}" y2="${ry + rowH}" stroke="#d0d0d0" stroke-width="0.5"/>`;

      // Name
      const dn = r.name.length > 28 ? r.name.substring(0, 27) + '.' : r.name;
      svg += `<text x="${cx + 8}" y="${ry + 20}" class="c">${this.escSvg(dn)}</text>`;
      cx += nameW;

      // Subjects
      for (const sc of r.subjectScores) {
        svg += `<line x1="${cx}" y1="${ry}" x2="${cx}" y2="${ry + rowH}" stroke="#d0d0d0" stroke-width="0.5"/>`;
        const cb = cellBg(sc.correct, sc.total);
        if (cb !== 'transparent') {
          svg += `<rect x="${cx + 1}" y="${ry + 1}" width="${colW - 2}" height="${rowH - 2}" fill="${cb}" rx="2"/>`;
        }
        const val = sc.total > 0 ? String(sc.correct) : '0';
        const clr = sc.total > 0 ? textColor((sc.correct / sc.total) * 100) : '#999';
        svg += `<text x="${cx + colW / 2}" y="${ry + 20}" text-anchor="middle" class="cb" fill="${clr}">${val}</text>`;
        cx += colW;
      }

      // Total
      svg += `<line x1="${cx}" y1="${ry}" x2="${cx}" y2="${ry + rowH}" stroke="#d0d0d0" stroke-width="0.5"/>`;
      svg += `<text x="${cx + totalW / 2}" y="${ry + 20}" text-anchor="middle" class="cb" fill="#1f3864">${r.totalCorrect}/${r.totalQuestions}</text>`;
      cx += totalW;

      // Percentage
      svg += `<line x1="${cx}" y1="${ry}" x2="${cx}" y2="${ry + rowH}" stroke="#d0d0d0" stroke-width="0.5"/>`;
      svg += `<text x="${cx + pctW / 2}" y="${ry + 20}" text-anchor="middle" class="cb" fill="${textColor(r.percentage)}">${r.percentage}%</text>`;
    }

    // Table border
    const totalH = headerH + rows.length * rowH;
    svg += `<rect x="${tX}" y="${tY}" width="${tableW}" height="${totalH}" fill="none" stroke="#1f3864" stroke-width="2" rx="4"/>`;
    svg += `<line x1="${tX}" y1="${tY + headerH}" x2="${tX + tableW}" y2="${tY + headerH}" stroke="#1f3864" stroke-width="2"/>`;

    svg += '</svg>';
    return Buffer.from(svg, 'utf-8');
  }

  private escSvg(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  stop(): void {
    if (this.bot) {
      this.bot.stopPolling();
      logger.info('Telegram bot stopped', 'TELEGRAM');
    }
  }
}

export const TelegramBotService = new TelegramBotServiceClass();
