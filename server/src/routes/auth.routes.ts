import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import Role from '../models/Role';
import { UserRole } from '../models/User';
import { authLimiter } from '../middleware/rateLimiter';

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
        roleDisplayName: roleDisplayName // Добавляем отображаемое имя
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
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
      },
    });
  } catch (error) {
    console.error('SSO error:', error);
    res.status(500).json({ message: 'Server xatosi' });
  }
});

export default router;
