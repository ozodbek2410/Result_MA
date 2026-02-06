import express from 'express';
import bcrypt from 'bcryptjs';
import User, { UserRole } from '../models/User';
import { authenticate, AuthRequest } from '../middleware/auth';
import { invalidateCache } from '../middleware/cache';

const router = express.Router();

// Получить всех учителей (фильтруем пользователей с ролью TEACHER)
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('=== ПОЛУЧЕНИЕ УЧИТЕЛЕЙ ===');
    console.log('Пользователь:', { id: req.user?.id, role: req.user?.role, branchId: req.user?.branchId });
    
    const filter: any = { role: UserRole.TEACHER, isActive: true };
    
    // Филиал админ видит только учителей своего филиала
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      filter.branchId = req.user?.branchId;
    }
    
    console.log('Фильтр:', filter);
    
    const teachers = await User.find(filter)
      .select('-password')
      .populate('branchId')
      .sort({ createdAt: -1 });
    
    console.log(`✅ Найдено учителей: ${teachers.length}`);
    if (teachers.length > 0) {
      teachers.forEach((t, i) => {
        const branch = t.branchId as any;
        console.log(`Учитель ${i + 1}:`, { 
          id: t._id, 
          name: t.fullName || t.username,
          branchId: branch?._id || t.branchId,
          branchName: branch?.name || 'N/A'
        });
      });
    }
    
    res.json(teachers);
  } catch (error: any) {
    console.error('❌ Ошибка получения учителей:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Создать учителя
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('=== СОЗДАНИЕ УЧИТЕЛЯ ===');
    console.log('Данные:', { ...req.body, password: '***' });
    console.log('Пользователь:', { id: req.user?.id, role: req.user?.role, branchId: req.user?.branchId });
    
    const { username, password, fullName, phone } = req.body;
    
    if (!username || !password || !fullName) {
      return res.status(400).json({ message: 'Barcha maydonlar majburiy' });
    }
    
    // Проверка существующего логина
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      console.log('❌ Логин занят:', username);
      return res.status(400).json({ message: 'Bu login band' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = new User({
      username,
      password: hashedPassword,
      fullName,
      phone,
      role: UserRole.TEACHER,
      branchId: req.user?.branchId,
      isActive: true
    });
    
    await teacher.save();
    console.log('✅ Учитель создан:', { id: teacher._id, branchId: teacher.branchId });
    
    const populatedTeacher = await User.findById(teacher._id)
      .select('-password')
      .populate('branchId');
    
    // Инвалидируем кэш учителей
    await invalidateCache('/api/teachers');
    
    res.status(201).json(populatedTeacher);
  } catch (error: any) {
    console.error('❌ Ошибка создания учителя:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Обновить учителя
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('=== ОБНОВЛЕНИЕ УЧИТЕЛЯ ===');
    console.log('Teacher ID:', req.params.id);
    console.log('Данные:', { ...req.body, password: req.body.password ? '***' : undefined });
    
    const teacher = await User.findOne({ _id: req.params.id, role: UserRole.TEACHER });
    if (!teacher) {
      console.log('❌ Учитель не найден');
      return res.status(404).json({ message: 'O\'qituvchi topilmadi' });
    }
    
    const { username, password, fullName, phone } = req.body;
    
    // Проверяем уникальность логина
    if (username && username !== teacher.username) {
      const existingUser = await User.findOne({ 
        username, 
        _id: { $ne: teacher._id } 
      });
      if (existingUser) {
        console.log('❌ Логин занят:', username);
        return res.status(400).json({ message: 'Bu login band' });
      }
      teacher.username = username;
    }
    
    if (password) {
      teacher.password = await bcrypt.hash(password, 10);
    }
    if (fullName) teacher.fullName = fullName;
    if (phone !== undefined) teacher.phone = phone;
    
    await teacher.save();
    console.log('✅ Учитель обновлен');
    
    const updatedTeacher = await User.findById(teacher._id)
      .select('-password')
      .populate('branchId');
    
    // Инвалидируем кэш учителей
    await invalidateCache('/api/teachers');
    
    res.json(updatedTeacher);
  } catch (error: any) {
    console.error('❌ Error updating teacher:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

// Удалить учителя
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    console.log('=== УДАЛЕНИЕ УЧИТЕЛЯ ===');
    console.log('Teacher ID:', req.params.id);
    
    const teacher = await User.findOne({ _id: req.params.id, role: UserRole.TEACHER });
    if (!teacher) {
      console.log('❌ Учитель не найден');
      return res.status(404).json({ message: 'O\'qituvchi topilmadi' });
    }
    
    console.log('Найден учитель:', { id: teacher._id, name: teacher.fullName || teacher.username });
    
    // Обнуляем teacherId во всех группах этого учителя
    const Group = require('../models/Group').default;
    const updateResult = await Group.updateMany(
      { teacherId: req.params.id },
      { $unset: { teacherId: '' } }
    );
    
    console.log(`✅ Обновлено групп: ${updateResult.modifiedCount}`);
    
    // Полностью удаляем учителя
    await User.findByIdAndDelete(req.params.id);
    console.log('✅ Учитель удален из БД');
    
    // Инвалидируем кэш учителей и групп
    await Promise.all([
      invalidateCache('/api/teachers'),
      invalidateCache('/api/groups')
    ]);
    
    res.json({ message: 'O\'qituvchi o\'chirildi' });
  } catch (error: any) {
    console.error('❌ Error deleting teacher:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
