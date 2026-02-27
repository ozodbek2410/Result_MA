import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import Student from '../models/Student';
import Group from '../models/Group';
import Subject from '../models/Subject';
import StudentGroup from '../models/StudentGroup';
import Branch from '../models/Branch';

dotenv.config();

// Узбекские имена для генерации
const firstNames = [
  'Ali', 'Aziz', 'Bobur', 'Davron', 'Eldor', 'Farrux', 'Gulom', 'Hamid', 'Ilhom', 'Javohir',
  'Kamol', 'Laziz', 'Mansur', 'Nodir', 'Otabek', 'Rustam', 'Sardor', 'Timur', 'Ulugbek', 'Vali',
  'Aziza', 'Barno', 'Dilnoza', 'Feruza', 'Gulnora', 'Hilola', 'Iroda', 'Kamola', 'Madina', 'Nigora'
];

const lastNames = [
  'Aliyev', 'Azimov', 'Boboev', 'Davronov', 'Ergashev', 'Fayziyev', 'Gulomov', 'Hamidov',
  'Ismoilov', 'Jalolov', 'Karimov', 'Mahmudov', 'Normatov', 'Olimov', 'Rahimov',
  'Saidov', 'Tursunov', 'Umarov', 'Vohidov', 'Yusupov'
];

function generateFullName(): string {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

function generatePhone(): string {
  return `+998${90 + Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
}

function generateProfileToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

async function create7thGradeStudents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system');
    console.log('✅ MongoDB подключен');

    // Получаем первый филиал
    const branch = await Branch.findOne({ isActive: true });
    if (!branch) {
      console.error('❌ Филиал не найден. Сначала создайте филиал.');
      process.exit(1);
    }
    console.log(`✅ Филиал найден: ${branch.name}`);

    // Получаем все активные предметы
    const subjects = await Subject.find({ isActive: true });
    if (subjects.length === 0) {
      console.error('❌ Предметы не найдены. Сначала создайте предметы.');
      process.exit(1);
    }
    console.log(`✅ Найдено предметов: ${subjects.length}`);

    const classNumber = 7;
    const groupLetter = 'A';
    const numberOfStudents = 30;

    // Создаем или находим группы для всех предметов
    console.log('\n📚 Создание групп для всех предметов...');
    const groups = [];
    
    for (const subject of subjects) {
      let group = await Group.findOne({
        branchId: branch._id,
        classNumber,
        letter: groupLetter,
        subjectId: subject._id
      });

      if (!group) {
        group = await Group.create({
          branchId: branch._id,
          name: `${classNumber}-${groupLetter} (${subject.nameUzb})`,
          classNumber,
          letter: groupLetter,
          subjectId: subject._id,
          capacity: 30
        });
        console.log(`  ✅ Создана группа: ${group.name}`);
      } else {
        console.log(`  ℹ️  Группа уже существует: ${group.name}`);
      }
      
      groups.push(group);
    }

    // Создаем 30 учеников
    console.log(`\n👥 Создание ${numberOfStudents} учеников...`);
    const createdStudents = [];

    for (let i = 1; i <= numberOfStudents; i++) {
      const fullName = generateFullName();
      const phone = generatePhone();
      const profileToken = generateProfileToken();

      const student = await Student.create({
        branchId: branch._id,
        fullName,
        classNumber,
        phone,
        subjectIds: subjects.map(s => s._id),
        profileToken
      });

      createdStudents.push(student);
      console.log(`  ${i}. ${fullName} - ${phone}`);
    }

    // Добавляем всех учеников во все группы
    console.log('\n🔗 Добавление учеников в группы...');
    let assignmentCount = 0;

    for (const student of createdStudents) {
      for (const group of groups) {
        // Проверяем, не существует ли уже связь
        const existingAssignment = await StudentGroup.findOne({
          studentId: student._id,
          groupId: group._id
        });

        if (!existingAssignment) {
          await StudentGroup.create({
            studentId: student._id,
            groupId: group._id,
            subjectId: group.subjectId
          });
          assignmentCount++;
        }
      }
    }

    console.log(`  ✅ Создано связей: ${assignmentCount}`);

    // Итоговая статистика
    console.log('\n' + '='.repeat(50));
    console.log('🎉 УСПЕШНО ЗАВЕРШЕНО!');
    console.log('='.repeat(50));
    console.log(`📍 Филиал: ${branch.name}`);
    console.log(`🎓 Класс: ${classNumber}-${groupLetter}`);
    console.log(`👥 Создано учеников: ${createdStudents.length}`);
    console.log(`📚 Предметов: ${subjects.length}`);
    console.log(`🏫 Групп: ${groups.length}`);
    console.log(`🔗 Связей ученик-группа: ${assignmentCount}`);
    console.log('='.repeat(50));

    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при создании данных:', error);
    process.exit(1);
  }
}

create7thGradeStudents();
