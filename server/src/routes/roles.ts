import express from 'express';
import Role from '../models/Role';
import { UserRole } from '../models/User';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Get all roles
router.get('/', authenticate, async (req, res) => {
  try {
    const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();
    res.json(roles);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get role by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }
    res.json(role);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Create new role (Super Admin only)
router.post('/', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const { name, displayName, description, permissions } = req.body;

    // Check if role already exists
    const existingRole = await Role.findOne({ name: name.toUpperCase() });
    if (existingRole) {
      return res.status(400).json({ message: 'Role with this name already exists' });
    }

    const role = new Role({
      name: name.toUpperCase(),
      displayName,
      description,
      permissions: permissions || [],
      isSystem: false
    });

    await role.save();
    res.status(201).json(role);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Update role (Super Admin only)
router.put('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    if (role.isSystem) {
      return res.status(403).json({ message: 'Cannot modify system role' });
    }

    const { displayName, description, permissions } = req.body;

    if (displayName) role.displayName = displayName;
    if (description !== undefined) role.description = description;
    if (permissions) role.permissions = permissions;

    await role.save();
    res.json(role);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

// Delete role (Super Admin only)
router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    if (role.isSystem) {
      return res.status(403).json({ message: 'Cannot delete system role' });
    }

    // Check if any users have this role
    const User = require('../models/User').default;
    const usersWithRole = await User.countDocuments({ role: role.name });
    
    if (usersWithRole > 0) {
      return res.status(400).json({ 
        message: `Cannot delete role. ${usersWithRole} user(s) still have this role.` 
      });
    }

    await role.deleteOne();
    res.json({ message: 'Role deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

// Get available permissions
router.get('/permissions/list', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  try {
    const permissions = [
      // Boshqaruv paneli
      { key: 'view_dashboard', label: "Ko'rish", group: 'Boshqaruv paneli' },
      { key: 'view_statistics', label: "Ko'rish", group: 'Statistika' },
      
      // Foydalanuvchilar
      { key: 'view_users', label: "Ko'rish", group: 'Foydalanuvchilar' },
      { key: 'create_users', label: "Yaratish", group: 'Foydalanuvchilar' },
      { key: 'edit_users', label: "Tahrirlash", group: 'Foydalanuvchilar' },
      { key: 'delete_users', label: "O'chirish", group: 'Foydalanuvchilar' },
      
      // Filiallar
      { key: 'view_branches', label: "Ko'rish", group: 'Filiallar' },
      { key: 'create_branches', label: "Yaratish", group: 'Filiallar' },
      { key: 'edit_branches', label: "Tahrirlash", group: 'Filiallar' },
      { key: 'delete_branches', label: "O'chirish", group: 'Filiallar' },
      
      // Guruhlar
      { key: 'view_groups', label: "Ko'rish", group: 'Guruhlar' },
      { key: 'create_groups', label: "Yaratish", group: 'Guruhlar' },
      { key: 'edit_groups', label: "Tahrirlash", group: 'Guruhlar' },
      { key: 'delete_groups', label: "O'chirish", group: 'Guruhlar' },
      
      // O'quvchilar
      { key: 'view_students', label: "Ko'rish", group: "O'quvchilar" },
      { key: 'create_students', label: "Yaratish", group: "O'quvchilar" },
      { key: 'edit_students', label: "Tahrirlash", group: "O'quvchilar" },
      { key: 'delete_students', label: "O'chirish", group: "O'quvchilar" },
      
      // O'qituvchilar
      { key: 'view_teachers', label: "Ko'rish", group: "O'qituvchilar" },
      { key: 'create_teachers', label: "Yaratish", group: "O'qituvchilar" },
      { key: 'edit_teachers', label: "Tahrirlash", group: "O'qituvchilar" },
      { key: 'delete_teachers', label: "O'chirish", group: "O'qituvchilar" },
      
      // Testlar
      { key: 'view_tests', label: "Ko'rish", group: 'Testlar' },
      { key: 'create_tests', label: "Yaratish", group: 'Testlar' },
      { key: 'edit_tests', label: "Tahrirlash", group: 'Testlar' },
      { key: 'delete_tests', label: "O'chirish", group: 'Testlar' },
      
      // Blok testlar
      { key: 'view_block_tests', label: "Ko'rish", group: 'Blok testlar' },
      { key: 'create_block_tests', label: "Yaratish", group: 'Blok testlar' },
      { key: 'edit_block_tests', label: "Tahrirlash", group: 'Blok testlar' },
      { key: 'delete_block_tests', label: "O'chirish", group: 'Blok testlar' },
      
      // Topshiriqlar
      { key: 'view_assignments', label: "Ko'rish", group: 'Topshiriqlar' },
      { key: 'create_assignments', label: "Yaratish", group: 'Topshiriqlar' },
      { key: 'edit_assignments', label: "Tahrirlash", group: 'Topshiriqlar' },
      { key: 'delete_assignments', label: "O'chirish", group: 'Topshiriqlar' },
      
      // Fanlar
      { key: 'view_subjects', label: "Ko'rish", group: 'Fanlar' },
      { key: 'create_subjects', label: "Yaratish", group: 'Fanlar' },
      { key: 'edit_subjects', label: "Tahrirlash", group: 'Fanlar' },
      { key: 'delete_subjects', label: "O'chirish", group: 'Fanlar' },
      
      // Yo'nalishlar
      { key: 'view_directions', label: "Ko'rish", group: "Yo'nalishlar" },
      { key: 'create_directions', label: "Yaratish", group: "Yo'nalishlar" },
      { key: 'edit_directions', label: "Tahrirlash", group: "Yo'nalishlar" },
      { key: 'delete_directions', label: "O'chirish", group: "Yo'nalishlar" },
      
      // Rollar
      { key: 'view_roles', label: "Ko'rish", group: 'Rollar' },
      { key: 'create_roles', label: "Yaratish", group: 'Rollar' },
      { key: 'edit_roles', label: "Tahrirlash", group: 'Rollar' },
      { key: 'delete_roles', label: "O'chirish", group: 'Rollar' },
    ];

    res.json(permissions);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
