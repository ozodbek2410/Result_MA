import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = express.Router();

router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      filter.branchId = req.user?.branchId;
    }
    const users = await User.find(filter)
      .select('-password')
      .populate('branchId', 'name location')
      .lean()
      .exec();
    res.json(users);
  } catch (error: any) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN), async (req: AuthRequest, res) => {
  try {
    console.log('=== СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ ===');
    console.log('Данные:', { ...req.body, password: '***' });
    
    const { username, password, role, branchId, phone, fullName, parentPhone } = req.body;
    
    // Validation
    if (!username || !password) {
      return res.status(400).json({ message: 'Login va parol majburiy' });
    }
    
    if (!role) {
      return res.status(400).json({ message: 'Rol majburiy' });
    }
    
    if (!branchId && role !== UserRole.SUPER_ADMIN) {
      return res.status(400).json({ message: 'Filial majburiy' });
    }
    
    // Для учителя и студента нужно имя
    if ((role === UserRole.TEACHER || role === UserRole.STUDENT) && !fullName) {
      return res.status(400).json({ message: 'F.I.Sh majburiy' });
    }
    
    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('❌ Логин занят:', username);
      return res.status(400).json({ message: 'Bu login band' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      password: hashedPassword,
      fullName, // Добавляем fullName
      role,
      branchId: branchId || undefined,
      phone,
      parentPhone, // Для студентов
      isActive: true
    });
    
    await user.save();
    console.log('✅ User создан:', { id: user._id, role: user.role, branchId: user.branchId, fullName: user.fullName });
    
    res.status(201).json({ 
      id: user._id, 
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      branchId: user.branchId 
    });
  } catch (error: any) {
    console.error('❌ Ошибка создания пользователя:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPER_ADMIN, UserRole.FIL_ADMIN), async (req: AuthRequest, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    
    // Только сам супер-админ может изменить свои данные
    if (targetUser.role === UserRole.SUPER_ADMIN && req.user?.id !== req.params.id) {
      return res.status(403).json({ message: 'Super Admin faqat o\'z ma\'lumotlarini o\'zgartirishi mumkin' });
    }
    
    const { password, ...updateData } = req.body;
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    
    res.json(user);
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    console.log('=== УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ ===');
    console.log('User ID:', req.params.id);
    
    const user = await User.findById(req.params.id);
    if (!user) {
      console.log('❌ Пользователь не найден');
      return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
    }
    
    console.log('Найден пользователь:', { id: user._id, role: user.role, username: user.username });
    
    // Запрет на удаление супер-админа
    if (user.role === UserRole.SUPER_ADMIN) {
      console.log('❌ Попытка удалить супер-админа');
      return res.status(403).json({ message: 'Super Admin rolini o\'chirib bo\'lmaydi!' });
    }
    
    // Полностью удаляем пользователя из базы данных
    await User.findByIdAndDelete(req.params.id);
    console.log('✅ User полностью удален из БД');
    
    res.json({ message: 'Foydalanuvchi o\'chirildi' });
  } catch (error: any) {
    console.error('❌ Ошибка удаления пользователя:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
