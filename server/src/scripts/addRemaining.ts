import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();
const GROUP_ID = '699d8916d9a16fa13f325f20';
const SG = mongoose.model('StudentGroup', new mongoose.Schema({},{strict:false}), 'studentgroups');
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  // Teshaeva Kumush - ID found
  const id = '699d892bd9a16fa13f325f57';
  const exists = await SG.findOne({ studentId: new mongoose.Types.ObjectId(id), groupId: GROUP_ID }).lean();
  if (exists) {
    console.log('Already in group: Teshaeva Kumush');
  } else {
    await SG.create({ studentId: new mongoose.Types.ObjectId(id), groupId: new mongoose.Types.ObjectId(GROUP_ID) });
    console.log('ADDED: Teshaeva Kumush');
  }
  await mongoose.disconnect();
}
run().catch(console.error);
