import express from 'express';
import mongoose from 'mongoose';
import Direction from '../models/Direction';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = express.Router();
const CRM_MSG = 'Bu ma\'lumot CRM orqali boshqariladi';

router.get('/', authenticate, async (req, res) => {
  try {
    const directions = await Direction.find({ isActive: true })
      .populate('subjects.subjectIds')
      .lean()
      .exec();
    res.json(directions);
  } catch (error: any) {
    console.error('Error fetching directions:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.post('/', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    console.log('Creating direction:', req.body);
    
    // Преобразуем строковые ID в ObjectId с валидацией
    const directionData = {
      ...req.body,
      subjects: req.body.subjects?.map((subj: any) => ({
        type: subj.type,
        subjectIds: subj.subjectIds.map((id: string) => {
          // Проверяем что ID валидный
          if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error(`Invalid ObjectId: ${id}`);
          }
          return new mongoose.Types.ObjectId(id);
        })
      }))
    };
    
    const direction = new Direction(directionData);
    await direction.save();
    
    const populatedDirection = await Direction.findById(direction._id).populate('subjects.subjectIds');
    
    console.log('Direction created:', populatedDirection);
    res.status(201).json(populatedDirection);
  } catch (error: any) {
    console.error('Error creating direction:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.put('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    console.log('Updating direction:', req.params.id);
    console.log('Update data:', JSON.stringify(req.body, null, 2));
    
    // Преобразуем строковые ID в ObjectId с валидацией
    const updateData = {
      ...req.body,
      subjects: req.body.subjects?.map((subj: any) => ({
        type: subj.type,
        subjectIds: subj.subjectIds.map((id: string) => {
          // Проверяем что ID валидный
          if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error(`Invalid ObjectId: ${id}`);
          }
          return new mongoose.Types.ObjectId(id);
        })
      }))
    };
    
    const direction = await Direction.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('subjects.subjectIds');
    
    if (!direction) {
      return res.status(404).json({ message: 'Yo\'nalish topilmadi' });
    }
    
    console.log('Direction updated:', direction);
    res.json(direction);
  } catch (error: any) {
    console.error('Error updating direction:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

router.delete('/:id', authenticate, authorize(UserRole.SUPER_ADMIN), async (req, res) => {
  return res.status(403).json({ message: CRM_MSG });
  try {
    const direction = await Direction.findByIdAndUpdate(req.params.id, { isActive: false });
    if (!direction) {
      return res.status(404).json({ message: 'Yo\'nalish topilmadi' });
    }
    res.json({ message: 'Yo\'nalish o\'chirildi' });
  } catch (error: any) {
    console.error('Error deleting direction:', error);
    res.status(500).json({ message: 'Server xatosi', error: error.message });
  }
});

export default router;
