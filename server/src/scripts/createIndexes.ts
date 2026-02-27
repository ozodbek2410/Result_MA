import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Group from '../models/Group';
import StudentGroup from '../models/StudentGroup';
import Test from '../models/Test';
import BlockTest from '../models/BlockTest';
import TestResult from '../models/TestResult';
import StudentVariant from '../models/StudentVariant';
import Branch from '../models/Branch';
import Subject from '../models/Subject';
import Direction from '../models/Direction';
import { Assignment, AssignmentSubmission } from '../models/Assignment';
import Upload from '../models/Upload';
import User from '../models/User';

dotenv.config();

async function createIndexes() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/education_system';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    console.log('Creating indexes for all collections...');

    // Create indexes for all models
    await Promise.all([
      Student.createIndexes(),
      Teacher.createIndexes(),
      Group.createIndexes(),
      StudentGroup.createIndexes(),
      Test.createIndexes(),
      BlockTest.createIndexes(),
      TestResult.createIndexes(),
      StudentVariant.createIndexes(),
      Branch.createIndexes(),
      Subject.createIndexes(),
      Direction.createIndexes(),
      Assignment.createIndexes(),
      AssignmentSubmission.createIndexes(),
      Upload.createIndexes(),
      User.createIndexes()
    ]);

    console.log('✓ All indexes created successfully');

    // List all indexes
    console.log('\n=== Index Summary ===');
    
    const collections = [
      { name: 'Student', model: Student },
      { name: 'Teacher', model: Teacher },
      { name: 'Group', model: Group },
      { name: 'StudentGroup', model: StudentGroup },
      { name: 'Test', model: Test },
      { name: 'BlockTest', model: BlockTest },
      { name: 'TestResult', model: TestResult },
      { name: 'StudentVariant', model: StudentVariant },
      { name: 'Branch', model: Branch },
      { name: 'Subject', model: Subject },
      { name: 'Direction', model: Direction },
      { name: 'Assignment', model: Assignment },
      { name: 'AssignmentSubmission', model: AssignmentSubmission },
      { name: 'Upload', model: Upload },
      { name: 'User', model: User }
    ];

    let totalIndexes = 0;
    for (const { name, model } of collections) {
      const indexes = await model.collection.getIndexes();
      const count = Object.keys(indexes).length;
      totalIndexes += count;
      console.log(`\n${name} indexes (${count}):`);
      Object.keys(indexes).forEach(key => {
        console.log(`  - ${key}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
    console.log(`\n✓ Total indexes created: ${totalIndexes}`);
    console.log('\nIndexes have been created. Your database queries should now be faster!');
  } catch (error) {
    console.error('Error creating indexes:', error);
    process.exit(1);
  }
}

createIndexes();
