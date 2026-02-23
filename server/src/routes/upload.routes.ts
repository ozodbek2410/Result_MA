import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import Upload from '../models/Upload';
import { authenticate, AuthRequest } from '../middleware/auth';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1200;
const JPEG_QUALITY = 80;

const router = express.Router();

// Определяем базовую директорию сервера
// __dirname в скомпилированном коде: /var/www/resultMA/server/dist/routes
// Поднимаемся на 2 уровня вверх: /var/www/resultMA/server
const SERVER_ROOT = path.join(__dirname, '..', '..');

const uploadDir = path.join(SERVER_ROOT, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Fayl turi qo\'llab-quvvatlanmaydi'));
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

router.post('/', authenticate, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Fayl yuklanmadi' });
    }

    let finalFilename = req.file.filename;
    let finalSize = req.file.size;
    let finalMimetype = req.file.mimetype;
    const ext = path.extname(req.file.originalname).toLowerCase();

    // Optimize images with sharp
    if (IMAGE_EXTENSIONS.includes(ext)) {
      try {
        const inputPath = path.join(uploadDir, req.file.filename);
        const optimizedName = `opt-${uuidv4()}.jpg`;
        const outputPath = path.join(uploadDir, optimizedName);

        await sharp(inputPath)
          .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toFile(outputPath);

        const stats = fs.statSync(outputPath);

        // Use optimized only if smaller
        if (stats.size < req.file.size) {
          fs.unlinkSync(inputPath);
          finalFilename = optimizedName;
          finalSize = stats.size;
          finalMimetype = 'image/jpeg';
        } else {
          fs.unlinkSync(outputPath);
        }
      } catch (sharpErr) {
        console.warn('Sharp optimization failed, using original:', sharpErr);
      }
    }

    const uploadDoc = new Upload({
      filename: finalFilename,
      originalName: req.file.originalname,
      mimetype: finalMimetype,
      size: finalSize,
      path: `/uploads/${finalFilename}`,
      uploadedBy: req.user?.id
    });

    await uploadDoc.save();

    res.json({
      id: uploadDoc._id,
      filename: uploadDoc.filename,
      originalName: uploadDoc.originalName,
      path: uploadDoc.path,
      url: uploadDoc.path
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Fayl yuklashda xatolik';
    res.status(500).json({ message: msg });
  }
});

export default router;
