import { useAuthStore } from '@/store/authStore';

const SUPER_ADMIN = 'SUPER_ADMIN';
const FIL_ADMIN = 'FIL_ADMIN';
const TEACHER = 'TEACHER';
const METHODIST = 'METHODIST';

export const usePermissions = () => {
  const user = useAuthStore((state) => state.user);

  const isSuperAdmin = user?.role === SUPER_ADMIN;
  const isFilAdmin = user?.role === FIL_ADMIN;
  const isAdmin = isSuperAdmin || isFilAdmin;
  const isTeacher = user?.role === TEACHER;
  const isMethodist = user?.role === METHODIST;

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return user.permissions?.includes(permission) ?? false;
  };

  const hasAnyPermission = (permissions: string[]): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return permissions.some(p => user.permissions?.includes(p));
  };

  const hasAllPermissions = (permissions: string[]): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return permissions.every(p => user.permissions?.includes(p));
  };

  const hasRole = (...roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    isSuperAdmin,
    isFilAdmin,
    isAdmin,
    isTeacher,
    isMethodist,
    permissions: user?.permissions ?? [],
  };
};
