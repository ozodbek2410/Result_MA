import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import Role from '../models/Role';
import { UserRole } from '../models/User';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validatePassword } from '../utils/passwordPolicy';

const router = express.Router();

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      return res.status(401).json({ message: 'Login yoki parol noto\'g\'ri' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Login yoki parol noto\'g\'ri' });
    }

    // Rolni topish va ruxsatlarni olish
    let permissions: string[] = [];
    let roleDisplayName = user.role; // По умолчанию название роли
    const role = await Role.findOne({ name: user.role });
    if (role) {
      permissions = role.permissions;
      roleDisplayName = role.displayName; // Получаем отображаемое имя
    }

    // Если пользователь - учитель, teacherId = user._id
    let teacherId = undefined;
    if (user.role === UserRole.TEACHER) {
      teacherId = user._id;
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role, 
        branchId: user.branchId,
        teacherId: teacherId,
        permissions: permissions
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        teacherId: teacherId,
        permissions: permissions,
        roleDisplayName: roleDisplayName,
        mustChangePassword: !!user.mustChangePassword,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// POST /api/auth/change-password — user-initiated change; enforced for mustChangePassword users
router.post('/change-password', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(400).json({ message: 'Joriy parol noto\'g\'ri' });
    }

    const policyError = validatePassword(newPassword);
    if (policyError) return res.status(400).json({ message: policyError });

    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'Yangi parol eski paroldan farq qilishi kerak' });
    }

    user.password = await bcrypt.hash(newPassword as string, 10);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({ message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (error) {
    console.error('change-password error:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// POST /api/auth/admin/reset-password — admin resets another user's password and marks must-change
router.post('/admin/reset-password', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    if (req.user.role !== UserRole.SUPER_ADMIN && req.user.role !== UserRole.FIL_ADMIN) {
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    const { userId, newPassword } = req.body as { userId?: string; newPassword?: string };
    if (!userId || !newPassword) return res.status(400).json({ message: 'userId va newPassword talab qilinadi' });

    const policyError = validatePassword(newPassword);
    if (policyError) return res.status(400).json({ message: policyError });

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    // FIL_ADMIN kan faqat o'z filialida
    if (req.user.role === UserRole.FIL_ADMIN && target.branchId?.toString() !== req.user.branchId) {
      return res.status(403).json({ message: 'Bu foydalanuvchi sizning filialga tegishli emas' });
    }

    target.password = await bcrypt.hash(newPassword, 10);
    target.mustChangePassword = true;
    target.passwordChangedAt = new Date();
    await target.save();

    res.json({ message: 'Parol tiklandi, foydalanuvchi birinchi loginda yangilashi shart' });
  } catch (error) {
    console.error('admin reset-password error:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

// POST /api/auth/sso — CRM dan avtomatik login (HMAC-SHA256 token)
router.post('/sso', authLimiter, async (req, res) => {
  try {
    const { crmId, token, ts } = req.body;

    if (!crmId || !token || !ts) {
      return res.status(400).json({ message: 'Parametrlar yetishmaydi' });
    }

    const ssoSecret = process.env.SSO_SECRET;
    if (!ssoSecret) {
      return res.status(500).json({ message: 'SSO sozlanmagan' });
    }

    // Timestamp 5 daqiqalik oyna
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(ts)) > 300) {
      return res.status(401).json({ message: 'Token muddati o\'tgan' });
    }

    // HMAC tekshirish (timing-safe)
    const expected = crypto
      .createHmac('sha256', ssoSecret)
      .update(`${crmId}.${ts}`)
      .digest('hex');

    const tokenBuf = Buffer.from(token as string, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
      return res.status(401).json({ message: 'Token noto\'g\'ri' });
    }

    // Foydalanuvchini topish
    const user = await User.findOne({ crmId: Number(crmId), isActive: true });
    if (!user) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }

    // Ruxsatlarni olish
    let permissions: string[] = [];
    let roleDisplayName = user.role;
    const role = await Role.findOne({ name: user.role });
    if (role) {
      permissions = role.permissions;
      roleDisplayName = role.displayName;
    }

    const teacherId = user.role === UserRole.TEACHER ? user._id : undefined;

    const jwtToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        branchId: user.branchId,
        teacherId,
        permissions,
      },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      token: jwtToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        teacherId,
        permissions,
        roleDisplayName,
        mustChangePassword: !!user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('SSO error:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
