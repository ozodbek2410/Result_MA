import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User, { UserRole } from '../models/User';
import Subject from '../models/Subject';
import Branch from '../models/Branch';

dotenv.config();

async function seedData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system');
    console.log('MongoDB connected');

    // Create admin if not exists
    const existingAdmin = await User.findOne({ username: 'admin' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        isActive: true
      });
      console.log('✅ Admin user created (admin/admin123)');
    }

    // Create default subjects
    const existingSubjects = await Subject.countDocuments();
    if (existingSubjects === 0) {
      await Subject.insertMany([
        { nameUzb: 'Matematika', isMandatory: true, isActive: true },
        { nameUzb: 'Ona tili va Adabiyot', isMandatory: true, isActive: true },
        { nameUzb: 'Tarix', isMandatory: true, isActive: true },
        { nameUzb: 'Fizika', isMandatory: false, isActive: true },
        { nameUzb: 'Kimyo', isMandatory: false, isActive: true },
        { nameUzb: 'Biologiya', isMandatory: false, isActive: true },
        { nameUzb: 'Ingliz tili', isMandatory: false, isActive: true },
        { nameUzb: 'Rus tili', isMandatory: false, isActive: true },
      ]);
      console.log('✅ Default subjects created');
    }

    // Create demo branch
    const existingBranches = await Branch.countDocuments();
    if (existingBranches === 0) {
      await Branch.create({
        name: 'Markaziy filial',
        location: 'Toshkent, Chilonzor tumani',
        isActive: true
      });
      console.log('✅ Demo branch created');
    }

    // Migration: "Ona tili" → "Ona tili va Adabiyot" (mavjud DB uchun)
    const onaTili = await Subject.findOne({ nameUzb: 'Ona tili' });
    if (onaTili) {
      await Subject.updateOne({ _id: onaTili._id }, { $set: { nameUzb: 'Ona tili va Adabiyot' } });
      console.log('✅ Renamed "Ona tili" → "Ona tili va Adabiyot"');
    } else {
      // Agar "Ona tili va Adabiyot" ham yo'q bo'lsa, yaratish
      const onaAdabiyot = await Subject.findOne({ nameUzb: 'Ona tili va Adabiyot' });
      if (!onaAdabiyot) {
        await Subject.create({ nameUzb: 'Ona tili va Adabiyot', isMandatory: true, isActive: true });
        console.log('✅ Created "Ona tili va Adabiyot" subject');
      }
    }

    console.log('\n🎉 Database seeded successfully!');
    console.log('\nLogin credentials:');
    console.log('Username: admin');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seedData();
