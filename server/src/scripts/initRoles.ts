import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../models/Role';

dotenv.config();

const systemRoles = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Super Admin',
    description: 'Tizimning barcha imkoniyatlariga ega',
    permissions: ['*'], // All permissions
    isSystem: true
  },
  {
    name: 'FIL_ADMIN',
    displayName: 'Filial Admin',
    description: 'Filial darajasida barcha imkoniyatlar',
    permissions: [
      'view_dashboard',
      'view_statistics',
      'view_groups',
      'create_groups',
      'edit_groups',
      'delete_groups',
      'view_students',
      'create_students',
      'edit_students',
      'delete_students',
      'view_teachers',
      'create_teachers',
      'edit_teachers',
      'delete_teachers',
    ],
    isSystem: true
  },
  {
    name: 'TEACHER',
    displayName: "O'qituvchi",
    description: "O'qituvchi uchun asosiy imkoniyatlar",
    permissions: [
      'view_dashboard',
      'view_groups',
      'view_students',
      'view_tests',
      'create_tests',
      'edit_tests',
      'delete_tests',
      'view_block_tests',
      'create_block_tests',
      'edit_block_tests',
      'delete_block_tests',
      'view_assignments',
      'create_assignments',
      'edit_assignments',
      'delete_assignments',
    ],
    isSystem: true
  }
];

async function initRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform');
    console.log('Connected to MongoDB');

    for (const roleData of systemRoles) {
      const existingRole = await Role.findOne({ name: roleData.name });
      
      if (existingRole) {
        console.log(`Role ${roleData.name} already exists, updating...`);
        await Role.findByIdAndUpdate(existingRole._id, roleData);
      } else {
        console.log(`Creating role ${roleData.name}...`);
        await Role.create(roleData);
      }
    }

    console.log('✅ System roles initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing roles:', error);
    process.exit(1);
  }
}

initRoles();
