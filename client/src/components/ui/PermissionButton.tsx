import { usePermissions } from '@/hooks/usePermissions';
import { ReactNode } from 'react';

interface PermissionButtonProps {
  permission: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}

export function PermissionButton({ 
  permission, 
  children, 
  className = '',
  onClick,
  title,
  type = 'button'
}: PermissionButtonProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(permission)) {
    return null;
  }

  return (
    <button
      type={type}
      onClick={onClick}
      className={className}
      title={title}
    >
      {children}
    </button>
  );
}
