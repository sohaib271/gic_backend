// src/others-stuff/seeder/subject.seeder.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject, SubjectDocument } from 'src/subject/schema/subject.schema';
import { Department, DepartmentDocument } from 'src/department/schema/department.schema';

/**
 * subjectId is handed out from 1 and never reused. The list below is a
 * starting catalogue — add to it freely, or create subjects from
 * POST /subjects, which continues the numbering automatically.
 */
const SUBJECTS: { name: string; code: string; category: string }[] = [
  { name: 'English', code: 'ENG', category: 'intermediate' },
  { name: 'Mathematics', code: 'MATH', category: 'intermediate' },
  { name: 'Physics', code: 'PHY', category: 'intermediate' },
  { name: 'Chemistry', code: 'CHEM', category: 'intermediate' },
  { name: 'Biology', code: 'BIO', category: 'intermediate' },
  { name: 'Computer Science', code: 'CS', category: 'bs' },
  { name: 'Urdu', code: 'URD', category: 'intermediate' },
  { name: 'Islamiyat', code: 'ISL', category: 'intermediate' },
  { name: 'Pakistan Studies', code: 'PAK', category: 'intermediate' },
  { name: 'Economics', code: 'ECON', category: 'bs' },
];

export async function seedSubjects() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const subjectModel = app.get<Model<SubjectDocument>>(getModelToken(Subject.name));
  const departmentModel = app.get<Model<DepartmentDocument>>(
    getModelToken(Department.name),
  );

  try {
    const departments = await departmentModel.find().lean();
    const byCode = new Map(
      departments
        .filter((d: any) => d.code)
        .map((d: any) => [String(d.code).toUpperCase(), d._id as Types.ObjectId]),
    );

    let created = 0;
    let skipped = 0;

    for (const entry of SUBJECTS) {
      const existing = await subjectModel.findOne({ name: entry.name });
      if (existing) {
        skipped++;
        continue;
      }

      // Numbering continues from the highest id already in use, so running
      // this seeder after subjects were created via the API is safe.
      const last = await subjectModel
        .findOne({}, { subjectId: 1 })
        .sort({ subjectId: -1 })
        .lean();

      await subjectModel.create({
        subjectId: (last?.subjectId ?? 0) + 1,
        name: entry.name,
        code: entry.code,
        category: entry.category,
        // Left unset on purpose: a subject can be shared across departments
        // until the admin assigns it.
        isActive: true,
      });

      created++;
    }

    const total = await subjectModel.countDocuments();
    console.log(`✅ Subjects ready — ${created} created, ${skipped} skipped, ${total} total.`);
    if (byCode.size === 0) {
      console.log('ℹ️  No departments with a code found; subjects seeded without a department.');
    }
  } catch (error) {
    console.error('❌ Error seeding subjects:', error);
    process.exitCode = 1;
  }

  await app.close();
}

seedSubjects();
