import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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

export default router;
