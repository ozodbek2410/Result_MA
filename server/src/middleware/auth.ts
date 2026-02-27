import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User';
import User from '../models/User';
import Role from '../models/Role';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: UserRole;
    branchId?: string;
    teacherId?: string;
    permissions?: string[];
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Yaroqsiz token' });
  }
};

export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log('=== ПРОВЕРКА АВТОРИЗАЦИИ ===');
    console.log('Required roles:', roles);
    console.log('User role:', req.user?.role);
    console.log('User:', req.user);
    
    if (!req.user || !roles.includes(req.user.role)) {
      console.log('❌ Доступ запрещен');
      return res.status(403).json({ message: 'Ruxsat yo\'q' });
    }
    console.log('✅ Доступ разрешен');
    next();
  };
};

// Ruxsatlarni tekshirish middleware
export const checkPermission = (...permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Autentifikatsiya talab qilinadi' });
    }

    // Super Admin barcha ruxsatlarga ega
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    try {
      // Foydalanuvchining rolini topish
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      }

      // Rolni topish
      const role = await Role.findOne({ name: user.role });
      if (!role) {
        return res.status(403).json({ message: 'Rol topilmadi' });
      }

      // Barcha ruxsatlarga ega bo'lsa
      if (role.permissions.includes('*')) {
        return next();
      }

      // Kerakli ruxsatlardan birortasi borligini tekshirish
      const hasPermission = permissions.some(permission => 
        role.permissions.includes(permission)
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          message: 'Sizda bu amalni bajarish uchun ruxsat yo\'q',
          required: permissions,
          has: role.permissions
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server xatosi' });
    }
  };
};
