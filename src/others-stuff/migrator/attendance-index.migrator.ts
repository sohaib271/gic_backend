// src/others-stuff/migrator/attendance-index.migrator.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Attendance,
  AttendenceDocument,
} from 'src/attendence/schema/attendence.schema';

/**
 * The unique index on attendance used to be
 *
 *   { classId, teacherId, date, lectureNumber }
 *
 * with no studentId. That allows exactly one record per period, so as soon as
 * lectureNumber became required a class could only ever have one student's
 * attendance saved — the second student of the same period was rejected with
 * E11000, and the app's "PATCH the marked one, bulk the rest" flow died with a
 * 409 on the bulk call.
 *
 * The key must include studentId. This drops the old index and builds the
 * correct one. Safe to re-run.
 */
const OLD_INDEX = 'classId_1_teacherId_1_date_1_lectureNumber_1';
const NEW_INDEX = 'classId_1_teacherId_1_date_1_lectureNumber_1_studentId_1';

export async function migrateAttendanceIndex() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const model = app.get<Model<AttendenceDocument>>(
    getModelToken(Attendance.name),
  );

  try {
    const collection = model.collection;

    // Report duplicates against the *new* key first, so a failure here is a
    // clear "clean this up" rather than an opaque index-build error.
    const clashes = await collection
      .aggregate([
        {
          $group: {
            _id: {
              classId: '$classId',
              teacherId: '$teacherId',
              date: '$date',
              lectureNumber: '$lectureNumber',
              studentId: '$studentId',
            },
            n: { $sum: 1 },
          },
        },
        { $match: { n: { $gt: 1 }, '_id.lectureNumber': { $ne: null } } },
        { $count: 'total' },
      ])
      .toArray();

    if (clashes.length > 0 && clashes[0].total > 0) {
      console.error(
        `❌ ${clashes[0].total} duplicated (class, teacher, date, lecture, student) group(s) must be merged before this migration can run.`,
      );
      process.exitCode = 1;
      return;
    }

    const existing = await collection.indexes();
    const names = existing.map((i) => i.name);

    if (names.includes(NEW_INDEX)) {
      const newIsUnique = existing.find((i) => i.name === NEW_INDEX)?.unique;
      if (newIsUnique) {
        console.log(`ℹ️  ${NEW_INDEX} already in place.`);
        if (names.includes(OLD_INDEX)) {
          await collection.dropIndex(OLD_INDEX);
          console.log(`✅ Dropped legacy index ${OLD_INDEX}.`);
        }
        return;
      }
      await collection.dropIndex(NEW_INDEX);
      console.log(`⚠️  Dropped non-unique ${NEW_INDEX} so it can be rebuilt.`);
    }

    await collection.createIndex(
      { classId: 1, teacherId: 1, date: 1, lectureNumber: 1, studentId: 1 },
      {
        name: NEW_INDEX,
        unique: true,
        // Legacy rows have no lectureNumber; keeping them out of the index is
        // what lets the backfill fill them in without colliding.
        partialFilterExpression: { lectureNumber: { $type: 'number' } },
      },
    );
    console.log(`✅ Created ${NEW_INDEX} (unique, per student).`);

    if (names.includes(OLD_INDEX)) {
      await collection.dropIndex(OLD_INDEX);
      console.log(`✅ Dropped legacy index ${OLD_INDEX}.`);
    }

    const total = await model.countDocuments();
    const withLecture = await collection.countDocuments({
      lectureNumber: { $type: 'number' },
    });
    console.log(
      `ℹ️  ${total} attendance record(s); ${withLecture} have a lectureNumber.`,
    );
  } catch (error) {
    console.error('❌ Attendance index migration failed:', error);
    process.exitCode = 1;
  } finally {
    // Must be a finally: the early return above would otherwise skip it and
    // leave the Nest context open, so the process would never exit.
    await app.close();
  }
}

migrateAttendanceIndex();
