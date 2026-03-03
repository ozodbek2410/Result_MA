import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const S = mongoose.model('Student', new mongoose.Schema({},{strict:false}), 'students');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const terms = ['Shomurodov','Tkirov','Teshayeva','Avezova','Umidjon','Jorayev','Shomurod','Otkirov','Kumush','Marhabo','Botir'];
  for (const q of terms) {
    const r = await S.find({fullName:{$regex:q,$options:'i'}}).select('_id fullName classNumber').lean();
    console.log(q+':', r.length ? (r as any[]).map((s:any)=>s._id+' | '+s.fullName+' | cls:'+s.classNumber).join(' ;; ') : 'YOQ');
  }
  await mongoose.disconnect();
}
run().catch(console.error);
