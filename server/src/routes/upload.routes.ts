import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import Upload from '../models/Upload';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

const uploadDir = path.join(process.cwd(), 'server', 'uploads');
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

    const uploadDoc = new Upload({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: `/uploads/${req.file.filename}`,
      uploadedBy: req.user?.id
    });

    await uploadDoc.save();

    res.json({
      id: uploadDoc._id,
      filename: uploadDoc.filename,
      originalName: uploadDoc.originalName,
      path: uploadDoc.path,
      url: `${req.protocol}://${req.get('host')}${uploadDoc.path}`
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Fayl yuklashda xatolik' });
  }
});

export default router;
