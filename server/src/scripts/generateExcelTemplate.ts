import * as XLSX from 'xlsx';
import path from 'path';

// Определяем базовую директорию сервера
// __dirname в скомпилированном коде: /var/www/resultMA/server/dist/scripts
// Поднимаемся на 2 уровня вверх: /var/www/resultMA/server
const SERVER_ROOT = path.join(__dirname, '..', '..');

// Пример данных для направления "Iqtisod" + majburiy fanlar
const exampleData = [
  {
    'F.I.Sh': 'Ravshanov Yuxanno',
    'Telefon': '+998332395010',
    'Sinf': 7,
    'Matematika': 'A',
    'Ingliz tili': 'B',
    'Iqtisod': 'C',
    'Ona tili': 'A',  // majburiy fan
    'Adabiyot': 'B'   // majburiy fan
  },
  {
    'F.I.Sh': 'Karimova Dilnoza',
    'Telefon': '+998901234567',
    'Sinf': 7,
    'Matematika': 'B',
    'Ingliz tili': 'A',
    'Iqtisod': 'A',
    'Ona tili': 'B',
    'Adabiyot': 'A'
  },
  {
    'F.I.Sh': 'Aliyev Sardor',
    'Telefon': '+998 90 123 45 67',
    'Sinf': 8,
    'Matematika': 'A',
    'Ingliz tili': 'A',
    'Iqtisod': 'B',
    'Ona tili': 'A',
    'Adabiyot': 'A'
  },
  {
    'F.I.Sh': 'Toshmatova Nigora',
    'Telefon': '',
    'Sinf': 7,
    'Matematika': 'C',
    'Ingliz tili': 'B',
    'Iqtisod': 'A',
    'Ona tili': 'C',
    'Adabiyot': 'B'
  },
  {
    'F.I.Sh': 'Usmonov Jasur',
    'Telefon': '+998(90)123-45-67',
    'Sinf': 9,
    'Matematika': 'A',
    'Ingliz tili': 'C',
    'Iqtisod': 'A',
    'Ona tili': 'A',
    'Adabiyot': 'C'
  },
  {
    'F.I.Sh': 'Rahimova Malika',
    'Telefon': '+998 33 239 50 10',
    'Sinf': 7,
    'Matematika': 'B',
    'Ingliz tili': 'B',
    'Iqtisod': 'C',
    'Ona tili': 'B',
    'Adabiyot': 'B'
  },
  {
    'F.I.Sh': 'Azimov Bekzod',
    'Telefon': '',
    'Sinf': 8,
    'Matematika': 'A',
    'Ingliz tili': 'A',
    'Iqtisod': 'A',
    'Ona tili': 'A',
    'Adabiyot': 'A'
  },
  {
    'F.I.Sh': 'Nurmatova Zarina',
    'Telefon': '+998912345678',
    'Sinf': 7,
    'Matematika': 'C',
    'Ingliz tili': 'C',
    'Iqtisod': 'B',
    'Ona tili': 'C',
    'Adabiyot': 'C'
  }
];

// Создаем workbook
const wb = XLSX.utils.book_new();

// Создаем worksheet из данных
const ws = XLSX.utils.json_to_sheet(exampleData);

// Устанавливаем ширину колонок
ws['!cols'] = [
  { wch: 25 }, // F.I.Sh
  { wch: 20 }, // Telefon
  { wch: 8 },  // Sinf
  { wch: 15 }, // Matematika
  { wch: 15 }, // Ingliz tili
  { wch: 15 }, // Iqtisod
  { wch: 15 }, // Ona tili
  { wch: 15 }  // Adabiyot
];

// Добавляем worksheet в workbook
XLSX.utils.book_append_sheet(wb, ws, 'Iqtisod yo\'nalishi');

// Сохраняем файл
const outputPath = path.join(SERVER_ROOT, 'uploads', 'student_import_template_example.xlsx');
XLSX.writeFile(wb, outputPath);

console.log(`✅ Excel файл создан: ${outputPath}`);
console.log(`📋 Включены yo'nalish fanlari: Matematika, Ingliz tili, Iqtisod`);
console.log(`📋 Включены majburiy fanlar: Ona tili, Adabiyot`);
