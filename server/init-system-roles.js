const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://resultma2_db_user:10qyG6hxMdd8H2XW@cluster0.tlffh49.mongodb.net/';

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  description: String,
  permissions: [String],
  isSystem: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Role = mongoose.model('Role', roleSchema);

const systemRoles = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Super Admin',
    description: 'Tizimning barcha imkoniyatlariga ega',
    permissions: ['*'],
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
      'view_tests',
      'view_block_tests',
      'view_assignments',
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
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB\'ga ulandi');

    for (const roleData of systemRoles) {
      const existingRole = await Role.findOne({ name: roleData.name });
      
      if (existingRole) {
        console.log(`📝 ${roleData.name} roli mavjud, yangilanmoqda...`);
        await Role.findByIdAndUpdate(existingRole._id, roleData);
      } else {
        console.log(`➕ ${roleData.name} roli yaratilmoqda...`);
        await Role.create(roleData);
      }
    }

    console.log('\n✅ Tizim rollari muvaffaqiyatli yaratildi!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

initRoles();
