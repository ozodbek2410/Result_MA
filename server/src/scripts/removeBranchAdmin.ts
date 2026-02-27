import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../models/Role';
import User from '../models/User';

dotenv.config();

async function removeBranchAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/test-platform');
    console.log('Connected to MongoDB');

    // Удаляем роль BRANCH_ADMIN
    const deletedRole = await Role.findOneAndDelete({ name: 'BRANCH_ADMIN' });
    if (deletedRole) {
      console.log('✅ Role BRANCH_ADMIN deleted from database');
    } else {
      console.log('ℹ️  Role BRANCH_ADMIN not found in database');
    }

    // Обновляем всех пользователей с BRANCH_ADMIN на FIL_ADMIN
    const result = await User.updateMany(
      { role: 'BRANCH_ADMIN' },
      { $set: { role: 'FIL_ADMIN' } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} users from BRANCH_ADMIN to FIL_ADMIN`);

    // Показываем оставшиеся роли
    const roles = await Role.find({});
    console.log('\n📋 Remaining roles in database:');
    roles.forEach(role => {
      console.log(`  - ${role.name} (${role.displayName})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error removing BRANCH_ADMIN:', error);
    process.exit(1);
  }
}

removeBranchAdmin();
