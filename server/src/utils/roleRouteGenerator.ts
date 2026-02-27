import fs from 'fs';
import path from 'path';

/**
 * Генератор роутов для новых ролей
 * Автоматически создает файл роутов на основе прав роли
 */

interface RoleConfig {
  name: string;           // Название роли (например, MANAGER)
  displayName: string;    // Отображаемое имя
  permissions: string[];  // Массив прав
  description?: string;   // Описание роли
}

/**
 * Генерирует код роутов на основе прав роли
 */
export function generateRouteCode(config: RoleConfig): string {
  const { name, displayName, permissions, description } = config;
  const roleName = name.toLowerCase();
  
  let code = `import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = express.Router();

/**
 * Роуты для роли ${name}
 * ${description || displayName}
 */

`;

  // Группируем права по категориям
  const categories = groupPermissionsByCategory(permissions);
  
  // Генерируем роуты для каждой категории
  for (const [category, perms] of Object.entries(categories)) {
    code += generateCategoryRoutes(category, perms, roleName);
  }
  
  code += `\nexport default router;\n`;
  
  return code;
}

/**
 * Группирует права по категориям (groups, students, tests и т.д.)
 */
function groupPermissionsByCategory(permissions: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  
  for (const perm of permissions) {
    // Извлекаем категорию из права (например, view_groups -> groups)
    const parts = perm.split('_');
    if (parts.length < 2) continue;
    
    const action = parts[0]; // view, create, edit, delete
    const category = parts.slice(1).join('_'); // groups, students, tests
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    categories[category].push(action);
  }
  
  return categories;
}

/**
 * Генерирует роуты для конкретной категории
 */
function generateCategoryRoutes(category: string, actions: string[], roleName: string): string {
  const modelName = getCategoryModelName(category);
  const routePath = category.replace(/_/g, '-');
  
  let code = `// ============= ${category.toUpperCase()} =============\n\n`;
  
  // Импорты моделей
  const imports = getCategoryImports(category);
  if (imports) {
    code = imports + code;
  }
  
  // GET all
  if (actions.includes('view')) {
    code += `// Получить все ${category}
router.get('/${routePath}', authenticate, requirePermission('view_${category}'), async (req: AuthRequest, res) => {
  try {
    const filter: any = {};
    
    // Фильтрация по филиалу для не-админов
    if (req.user?.role !== 'SUPER_ADMIN') {
      filter.branchId = req.user?.branchId;
    }
    
    const items = await ${modelName}.find(filter)
      .populate('branchId')
      .sort({ createdAt: -1 });
    
    res.json(items);
  } catch (error: any) {
    console.error('Error fetching ${category}:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

`;
  }
  
  // GET by ID
  if (actions.includes('view')) {
    code += `// Получить ${category} по ID
router.get('/${routePath}/:id', authenticate, requirePermission('view_${category}'), async (req: AuthRequest, res) => {
  try {
    const item = await ${modelName}.findById(req.params.id).populate('branchId');
    
    if (!item) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    // Проверка доступа к филиалу
    if (req.user?.role !== 'SUPER_ADMIN' && item.branchId?._id?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    res.json(item);
  } catch (error: any) {
    console.error('Error fetching ${category}:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

`;
  }
  
  // POST (create)
  if (actions.includes('create')) {
    code += `// Создать ${category}
router.post('/${routePath}', authenticate, requirePermission('create_${category}'), async (req: AuthRequest, res) => {
  try {
    const data = {
      ...req.body,
      branchId: req.user?.branchId,
      createdBy: req.user?.id
    };
    
    const item = new ${modelName}(data);
    await item.save();
    
    const populated = await ${modelName}.findById(item._id).populate('branchId');
    
    res.status(201).json(populated);
  } catch (error: any) {
    console.error('Error creating ${category}:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

`;
  }
  
  // PUT (update)
  if (actions.includes('edit')) {
    code += `// Обновить ${category}
router.put('/${routePath}/:id', authenticate, requirePermission('edit_${category}'), async (req: AuthRequest, res) => {
  try {
    const item = await ${modelName}.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    // Проверка доступа
    if (req.user?.role !== 'SUPER_ADMIN' && item.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    Object.assign(item, req.body);
    await item.save();
    
    const populated = await ${modelName}.findById(item._id).populate('branchId');
    
    res.json(populated);
  } catch (error: any) {
    console.error('Error updating ${category}:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

`;
  }
  
  // DELETE
  if (actions.includes('delete')) {
    code += `// Удалить ${category}
router.delete('/${routePath}/:id', authenticate, requirePermission('delete_${category}'), async (req: AuthRequest, res) => {
  try {
    const item = await ${modelName}.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ message: 'Не найдено' });
    }
    
    // Проверка доступа
    if (req.user?.role !== 'SUPER_ADMIN' && item.branchId?.toString() !== req.user?.branchId?.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    await ${modelName}.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Удалено успешно' });
  } catch (error: any) {
    console.error('Error deleting ${category}:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

`;
  }
  
  return code;
}

/**
 * Получает имя модели по категории
 */
function getCategoryModelName(category: string): string {
  const mapping: Record<string, string> = {
    'groups': 'Group',
    'students': 'Student',
    'teachers': 'Teacher',
    'tests': 'Test',
    'block_tests': 'BlockTest',
    'assignments': 'Assignment',
    'subjects': 'Subject',
    'directions': 'Direction',
    'branches': 'Branch',
    'users': 'User'
  };
  
  return mapping[category] || 'Model';
}

/**
 * Получает импорты для категории
 */
function getCategoryImports(category: string): string {
  const modelName = getCategoryModelName(category);
  return `import ${modelName} from '../models/${modelName}';\n`;
}

/**
 * Создает файл роутов для новой роли
 */
export async function createRoleRoutes(config: RoleConfig): Promise<string> {
  const code = generateRouteCode(config);
  const fileName = `${config.name.toLowerCase()}.routes.ts`;
  const filePath = path.join(__dirname, '../routes', fileName);
  
  // Создаем файл
  fs.writeFileSync(filePath, code, 'utf-8');
  
  console.log(`✅ Роуты созданы: ${filePath}`);
  
  return filePath;
}

/**
 * Добавляет роуты в index.ts
 */
export function addRoutesToIndex(roleName: string): string {
  const routesPath = path.join(__dirname, '../index.ts');
  let content = fs.readFileSync(routesPath, 'utf-8');
  
  const importLine = `import ${roleName.toLowerCase()}Routes from './routes/${roleName.toLowerCase()}.routes';`;
  const useLine = `app.use('/api/${roleName.toLowerCase()}', ${roleName.toLowerCase()}Routes);`;
  
  // Добавляем импорт
  if (!content.includes(importLine)) {
    const lastImport = content.lastIndexOf('import');
    const endOfLine = content.indexOf('\n', lastImport);
    content = content.slice(0, endOfLine + 1) + importLine + '\n' + content.slice(endOfLine + 1);
  }
  
  // Добавляем использование
  if (!content.includes(useLine)) {
    const lastUse = content.lastIndexOf('app.use(\'/api/');
    const endOfLine = content.indexOf('\n', lastUse);
    content = content.slice(0, endOfLine + 1) + useLine + '\n' + content.slice(endOfLine + 1);
  }
  
  fs.writeFileSync(routesPath, content, 'utf-8');
  
  console.log(`✅ Роуты добавлены в index.ts`);
  
  return routesPath;
}

// Пример использования
if (require.main === module) {
  const config: RoleConfig = {
    name: 'CUSTOM_ROLE',
    displayName: 'Кастомная роль',
    description: 'Описание кастомной роли',
    permissions: [
      'view_groups',
      'create_groups',
      'edit_groups',
      'view_students'
    ]
  };
  
  createRoleRoutes(config).then(() => {
    addRoutesToIndex(config.name);
    console.log('✅ Готово!');
  });
}
