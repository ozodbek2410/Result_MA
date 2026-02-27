import { Response, NextFunction } from 'express';
import Role from '../models/Role';
import { AuthRequest } from './auth';

/**
 * Middleware для проверки наличия определенного права у пользователя
 */
export const requirePermission = (permission: string | string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const userRole = req.user.role;

      // Super Admin имеет все права
      if (userRole === 'SUPER_ADMIN') {
        return next();
      }

      // Получаем роль пользователя из БД
      const role = await Role.findOne({ name: userRole });
      
      if (!role) {
        return res.status(403).json({ message: 'Role not found' });
      }

      // Проверяем наличие прав
      const permissions = Array.isArray(permission) ? permission : [permission];
      const hasPermission = permissions.some(perm => 
        role.permissions.includes('*') || role.permissions.includes(perm)
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          message: 'Access denied. Required permission: ' + permissions.join(' or ') 
        });
      }

      next();
    } catch (error: any) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  };
};

/**
 * Middleware для проверки наличия хотя бы одного из прав
 */
export const requireAnyPermission = (permissions: string[]) => {
  return requirePermission(permissions);
};

/**
 * Middleware для проверки наличия всех указанных прав
 */
export const requireAllPermissions = (permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const userRole = req.user.role;

      // Super Admin имеет все права
      if (userRole === 'SUPER_ADMIN') {
        return next();
      }

      // Получаем роль пользователя из БД
      const role = await Role.findOne({ name: userRole });
      
      if (!role) {
        return res.status(403).json({ message: 'Role not found' });
      }

      // Проверяем наличие всех прав
      const hasAllPermissions = permissions.every(perm => 
        role.permissions.includes('*') || role.permissions.includes(perm)
      );

      if (!hasAllPermissions) {
        return res.status(403).json({ 
          message: 'Access denied. Required permissions: ' + permissions.join(', ') 
        });
      }

      next();
    } catch (error: any) {
      console.error('Permission check error:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  };
};

/**
 * Получить права текущего пользователя
 */
export const getUserPermissions = async (userRole: string): Promise<string[]> => {
  if (userRole === 'SUPER_ADMIN') {
    return ['*'];
  }

  const role = await Role.findOne({ name: userRole });
  return role ? role.permissions : [];
};
