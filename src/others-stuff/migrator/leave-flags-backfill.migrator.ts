// src/others-stuff/migrator/leave-flags-backfill.migrator.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from 'src/user/schema/user.schema';

/**
 * `is_apply_leave` / `is_leave_approved` were added to the user schema with
 * `default: false`, but Mongoose only applies defaults when a document is
 * created — existing students keep the fields missing entirely. A projection
 * that asks for them then returns nothing, so the mobile app cannot tell
 * "no leave" from "field not supported yet".
 *
 * This backfills every user that is missing either flag. Safe to re-run.
 *
 * Existing leave requests are also taken into account: a student with a
 * non-cancelled request should not be reset to "no leave" by the backfill.
 */
export async function backfillLeaveFlags() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));

  try {
    // Seed the two flags everywhere they are absent.
    const seeded = await userModel.updateMany(
      {
        $or: [
          { is_apply_leave: { $exists: false } },
          { is_leave_approved: { $exists: false } },
        ],
      },
      {
        $set: { is_apply_leave: false, is_leave_approved: false },
      },
    );
    console.log(`✅ Backfilled flags on ${seeded.modifiedCount} user(s).`);

    // Reconcile with the leave collection, which is the source of truth.
    const leaveModel = app.get<Model<any>>(getModelToken('LeaveRequest'));
    if (leaveModel) {
      const active = await leaveModel
        .find({ status: { $in: ['PENDING', 'APPROVED'] } })
        .select('studentId status')
        .lean();

      const byStudent = new Map<string, { applied: boolean; approved: boolean }>();
      for (const row of active) {
        const id = row.studentId?.toString();
        if (!id) continue;
        const current = byStudent.get(id) ?? {
          applied: false,
          approved: false,
        };
        current.applied = true;
        if (row.status === 'APPROVED') current.approved = true;
        byStudent.set(id, current);
      }

      let reconciled = 0;
      for (const [studentId, flags] of byStudent) {
        const res = await userModel.updateOne(
          { _id: studentId },
          {
            $set: {
              is_apply_leave: flags.applied,
              is_leave_approved: flags.approved,
            },
          },
        );
        reconciled += res.modifiedCount ?? 0;
      }

      console.log(
        `ℹ️  ${byStudent.size} student(s) have an active leave request; ${reconciled} flag value(s) reconciled.`,
      );
    } else {
      console.log('ℹ️  LeaveRequest model not registered; skipped reconciliation.');
    }

    const onLeave = await userModel.countDocuments({ is_apply_leave: true });
    const approved = await userModel.countDocuments({ is_leave_approved: true });
    console.log(
      `ℹ️  ${onLeave} student(s) flagged as on leave, ${approved} approved.`,
    );
  } catch (error) {
    console.error('❌ Leave flag backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

backfillLeaveFlags();
