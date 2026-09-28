/**
 * 🎓 MIDTERM SCHEDULE SERVICE
 * ==========================
 * Backs the portal's Settings > Midterm Tests > Classes > "Midterm Test
 * Schedule" page: one date sheet per class, each row being a paper with a
 * subject, weekday, date and start/end time.
 *
 * Saving a schedule publishes it — every student enrolled in that class gets
 * an in-app + FCM push notification carrying notification_type "20", which is
 * the key the mobile app routes on to open the midterm schedule screen.
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MidtermSchedule,
  MidtermScheduleDocument,
} from './schema/midterm-schedule.schema';
import { SaveMidtermScheduleDto } from './dto/midterm-schedule.dto';
import {
  MIDTERM_NOTIFICATION_TYPE,
  MIDTERM_WEEKDAYS,
} from './midterm.constants';
import { NotificationService } from 'src/notification/notification.service';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';

type Actor = {
  _id: Types.ObjectId;
  role: string;
  isHod?: boolean;
  department?: Types.ObjectId;
  name?: string;
  lastName?: string;
};

type ClassLite = {
  _id: Types.ObjectId;
  className: string;
  session?: string;
  departmentId?: Types.ObjectId;
  classStudents?: Types.ObjectId[];
};

@Injectable()
export class MidtermService {
  private logger = new Logger('MidtermService');

  constructor(
    @InjectModel(MidtermSchedule.name)
    private readonly midtermModel: Model<MidtermScheduleDocument>,
    @InjectModel(Class.name)
    private readonly classModel: Model<ClassDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  // ============================================================
  // GET SCHEDULE (HOD / admin / assigned teacher)
  // ============================================================

  /**
   * Fetch the schedule of a class. Returns an empty schedule (not a 404) when
   * the HOD has not saved one yet, so the page can render its blank table.
   */
  async getSchedule(classId: string, actorId: string) {
    this.validateObjectId(classId, 'Invalid class ID');

    const [cls, actor] = await Promise.all([
      this.getClassLite(classId),
      this.getActor(actorId),
    ]);

    this.assertReadAccess(actor, cls);

    const schedule = await this.midtermModel
      .findOne({ classId: cls._id })
      .lean();

    return this.buildResponse(cls, schedule, false);
  }

  // ============================================================
  // GET MY SCHEDULE (student)
  // ============================================================

  /**
   * A student's own midterm schedules.
   *
   * A student is usually enrolled in several classes but only some of them get a
   * date sheet, so every enrolled class is returned (published ones first) and
   * `primary` points at the one worth showing first. `classId` narrows the
   * result to a single class when a notification names one.
   */
  async getMySchedule(studentId: string, classId?: string) {
    this.validateObjectId(studentId, 'Invalid user ID');

    const enrolled = await this.classModel
      .find({ classStudents: new Types.ObjectId(studentId) })
      .select('className session departmentId classStudents')
      .lean<ClassLite[]>();

    if (enrolled.length === 0) {
      throw new NotFoundException('You are not enrolled in any class yet');
    }

    // A notification carries the exact class, so honour it when it is the
    // student's own — that avoids showing a different class's empty sheet. Only
    // narrow down when that class actually has a sheet, otherwise fall through
    // so a published schedule elsewhere is not hidden behind an empty one.
    if (classId) {
      const match = enrolled.find((cls) => cls._id.toString() === classId);
      if (match) {
        const [schedule] = await this.findSchedules([match]);
        if (schedule) {
          const single = this.buildResponse(match, schedule, true);
          return { classes: [single], primary: single };
        }
      }
    }

    const schedules = await this.findSchedules(enrolled);
    const byClass = new Map(
      schedules.map((schedule) => [schedule?.classId.toString(), schedule]),
    );

    const classes = enrolled.map((cls) =>
      this.buildResponse(cls, byClass.get(cls._id.toString()), true),
    );

    // Published sheets first, soonest exam first, so the student lands on the
    // schedule that actually matters instead of an arbitrary enrolled class.
    classes.sort((a, b) => {
      if (a.exists !== b.exists) return a.exists ? -1 : 1;
      if (a.summary.from && b.summary.from && a.summary.from !== b.summary.from) {
        return a.summary.from < b.summary.from ? -1 : 1;
      }
      if (a.summary.from && !b.summary.from) return -1;
      if (!a.summary.from && b.summary.from) return 1;
      return a.className.localeCompare(b.className);
    });

    return {
      classes,
      primary: classes.find((entry) => entry.exists) ?? classes[0] ?? null,
    };
  }

  /** Fetch the stored schedule of each given class, in the same order. */
  private async findSchedules(classes: ClassLite[]) {
    const found = await this.midtermModel
      .find({ classId: { $in: classes.map((cls) => cls._id) } })
      .lean();

    const byClass = new Map(
      found.map((schedule) => [schedule.classId.toString(), schedule]),
    );

    return classes.map((cls) => byClass.get(cls._id.toString()));
  }

  // ============================================================
  // SAVE SCHEDULE (HOD / admin) — publishes + notifies students
  // ============================================================

  /**
   * Replace the whole schedule of a class and notify its students.
   *
   * @param classId - Class whose schedule is being saved
   * @param dto - Papers plus the optional notify flag
   * @param actorId - HOD/admin performing the save
   */
  async saveSchedule(
    classId: string,
    dto: SaveMidtermScheduleDto,
    actorId: string,
  ) {
    this.validateObjectId(classId, 'Invalid class ID');
    this.validateObjectId(actorId, 'Invalid user ID');

    const [cls, actor] = await Promise.all([
      this.getClassLite(classId),
      this.getActor(actorId),
    ]);

    this.assertWriteAccess(actor, cls);

    const papers = this.validatePapers(dto?.papers);
    const shouldNotify = dto?.notify !== false;

    const [schedule] = await Promise.all([
      this.midtermModel.findOneAndUpdate(
        { classId: cls._id },
        {
          $set: {
            papers,
            updatedBy: actor._id,
            publishedAt: shouldNotify ? new Date() : null,
          },
          $setOnInsert: { classId: cls._id, createdBy: actor._id },
        },
        { new: true, upsert: true, runValidators: true },
      ).lean(),
    ]);

    this.logger.log(
      `📅 Midterm schedule saved for ${cls.className} (${papers.length} papers) by ${actor.role}`,
    );

    // A failing notification must not lose a saved schedule, so it is
    // reported in the response instead of thrown.
    let studentsNotified = 0;
    let notificationError: string | undefined;

    if (shouldNotify) {
      try {
        studentsNotified = await this.notifyClassStudents(cls, papers, actor);
      } catch (error) {
        notificationError = 'Schedule saved but students could not be notified';
        this.logger.error(
          `Midterm notification failed for ${cls.className}: ${error}`,
        );
      }
    }

    return {
      ...this.buildResponse(cls, schedule, false),
      message: notificationError ?? 'Midterm schedule saved successfully',
      notified: shouldNotify,
      studentsNotified,
      ...(notificationError ? { notificationError } : {}),
    };
  }

  // ============================================================
  // CLEAR SCHEDULE
  // ============================================================

  /** Drop the whole date sheet for a class. */
  async clearSchedule(classId: string, actorId: string) {
    this.validateObjectId(classId, 'Invalid class ID');
    this.validateObjectId(actorId, 'Invalid user ID');

    const [cls, actor] = await Promise.all([
      this.getClassLite(classId),
      this.getActor(actorId),
    ]);

    this.assertWriteAccess(actor, cls);

    const result = await this.midtermModel.deleteOne({ classId: cls._id });

    this.logger.log(`🗑️ Midterm schedule cleared for ${cls.className}`);

    return {
      message: 'Midterm schedule cleared successfully',
      classId: cls._id.toString(),
      className: cls.className,
      deleted: result.deletedCount > 0,
    };
  }

  // ============================================================
  // 🔔 NOTIFY STUDENTS OF THE CLASS
  // ============================================================

  /**
   * Push the published schedule to every student enrolled in the class.
   * Recipients come straight from Class.classStudents so nobody outside the
   * class is touched.
   */
  private async notifyClassStudents(
    cls: ClassLite,
    papers: { date: string; paper: string }[],
    actor: Actor,
  ): Promise<number> {
    const studentIds = (cls.classStudents ?? [])
      .map((id) => id.toString())
      .filter((id) => Types.ObjectId.isValid(id));

    if (studentIds.length === 0) {
      this.logger.warn(
        `⚠️ ${cls.className} has no students — nobody was notified`,
      );
      return 0;
    }

    const summary = this.buildSummary(papers as any);
    const span =
      summary.from && summary.to
        ? ` from ${summary.from} to ${summary.to}`
        : '';

    return this.notificationService.createBulk({
      userIds: studentIds,
      senderId: actor._id.toString(),
      senderName:
        [actor.name, actor.lastName].filter(Boolean).join(' ') || 'Admin',
      senderRole: actor.role,
      type: 'midterm',
      title: 'Midterm Test Schedule',
      message: `The midterm test schedule for ${cls.className} has been published — ${summary.papers} paper(s)${span}.`,
      data: {
        notification_type: MIDTERM_NOTIFICATION_TYPE,
        classId: cls._id.toString(),
        className: cls.className,
        session: cls.session ?? null,
        papersCount: summary.papers,
        from: summary.from,
        to: summary.to,
      },
      classNames: [cls.className],
    });
  }

  // ============================================================
  // PAPER VALIDATION (beyond what class-validator can express)
  // ============================================================

  /** Trim inputs, then reject impossible times and clashing sittings. */
  private validatePapers(papers: any[]) {
    if (!Array.isArray(papers) || papers.length === 0) {
      throw new BadRequestException('Add at least one paper');
    }

    const cleaned = papers.map((paper, index) => {
      const name = String(paper?.paper ?? '').trim();
      const date = String(paper?.date ?? '').trim();
      const start = String(paper?.start ?? '').trim();
      const end = String(paper?.end ?? '').trim();
      const day = String(paper?.day ?? '').trim();
      const label = name || `Paper ${index + 1}`;

      if (!name) {
        throw new BadRequestException(`Paper ${index + 1}: paper name is required`);
      }

      if (!(MIDTERM_WEEKDAYS as readonly string[]).includes(day)) {
        throw new BadRequestException(
          `Paper "${label}": day must be one of ${MIDTERM_WEEKDAYS.join(', ')}`,
        );
      }

      if (!this.isRealDate(date)) {
        throw new BadRequestException(
          `Paper "${label}": ${date || 'date'} is not a valid date`,
        );
      }

      if (!this.isTime(start) || !this.isTime(end)) {
        throw new BadRequestException(
          `Paper "${label}": times must be in HH:mm format`,
        );
      }

      if (this.toMinutes(end) <= this.toMinutes(start)) {
        throw new BadRequestException(
          `Paper "${label}": end time must be after start time`,
        );
      }

      return { paper: name, day, date, start, end };
    });

    this.assertNoOverlap(cleaned);

    return cleaned;
  }

  /** Two papers cannot sit at the same time on the same date. */
  private assertNoOverlap(
    papers: { paper: string; date: string; start: string; end: string }[],
  ) {
    for (let i = 0; i < papers.length; i++) {
      for (let j = i + 1; j < papers.length; j++) {
        const first = papers[i];
        const second = papers[j];

        if (first.date !== second.date) continue;
        if (first.paper === second.paper) continue;

        const overlaps =
          this.toMinutes(first.start) < this.toMinutes(second.end) &&
          this.toMinutes(second.start) < this.toMinutes(first.end);

        if (overlaps) {
          throw new BadRequestException(
            `"${first.paper}" and "${second.paper}" overlap on ${first.date}`,
          );
        }
      }
    }
  }

  // ============================================================
  // SUMMARY (mirrors the portal's summary cards)
  // ============================================================

  /** Papers count, days covered and the first/last exam date. */
  private buildSummary(papers: { day: string; date: string }[] = []) {
    const dates = papers
      .map((paper) => paper.date)
      .filter(Boolean)
      .sort();

    return {
      papers: papers.length,
      days: new Set(papers.map((paper) => paper.day)).size,
      from: dates[0] ?? '',
      to: dates[dates.length - 1] ?? '',
    };
  }

  /** One response shape for every endpoint, empty schedule included. */
  private buildResponse(
    cls: ClassLite,
    schedule: any,
    forStudent: boolean,
  ) {
    const papers = (schedule?.papers ?? []) as any[];

    return {
      classId: cls._id.toString(),
      className: cls.className,
      session: cls.session ?? '',
      exists: Boolean(schedule),
      papers,
      summary: this.buildSummary(papers),
      publishedAt: schedule?.publishedAt ?? null,
      updatedAt: schedule?.updatedAt ?? null,
      ...(forStudent ? {} : { studentsCount: (cls.classStudents ?? []).length }),
    };
  }

  // ============================================================
  // ACCESS CONTROL
  // ============================================================

  private async getActor(actorId: string): Promise<Actor> {
    const actor = await this.userModel
      .findById(actorId)
      .select('_id role isHod department name lastName')
      .lean<Actor>();

    if (!actor) {
      throw new UnauthorizedException('Invalid user');
    }

    return actor;
  }

  private async getClassLite(classId: string): Promise<ClassLite> {
    if (!Types.ObjectId.isValid(classId)) {
      throw new BadRequestException('Invalid class ID');
    }

    const cls = await this.classModel
      .findById(classId)
      .select('className session departmentId classStudents')
      .lean<ClassLite>();

    if (!cls) {
      throw new NotFoundException("Class doesn't exist");
    }

    return cls;
  }

  /** admin: anything. HOD: own department only. teacher: own classes only. */
  private async assertReadAccess(actor: Actor, cls: ClassLite) {
    if (actor.role === 'admin') return;

    if (actor.isHod === true) {
      this.assertSameDepartment(actor, cls);
      return;
    }

    if (actor.role === 'proff') {
      const isAssigned = await this.classModel.exists({
        _id: cls._id,
        'assignes.teacherId': actor._id,
      });
      if (isAssigned) return;
    }

    throw new ForbiddenException('You cannot view this class schedule');
  }

  /** Only admin, or the HOD of the class's own department, may write. */
  private assertWriteAccess(actor: Actor, cls: ClassLite) {
    if (actor.role === 'admin') return;

    if (actor.isHod === true) {
      this.assertSameDepartment(actor, cls);
      return;
    }

    throw new ForbiddenException(
      'Only an admin or the HOD of this department can manage the midterm schedule',
    );
  }

  private assertSameDepartment(actor: Actor, cls: ClassLite) {
    const actorDepartment = actor.department?.toString();
    const classDepartment = cls.departmentId?.toString();

    if (!actorDepartment || actorDepartment !== classDepartment) {
      throw new ForbiddenException(
        'You can only manage schedules of your own department',
      );
    }
  }

  // ============================================================
  // SMALL HELPERS
  // ============================================================

  private toMinutes(time: string): number {
    const [hours, minutes] = String(time)
      .split(':')
      .map(Number);
    return hours * 60 + minutes;
  }

  private isTime(value: string): boolean {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  /** Rejects well-formatted but non-existent dates such as 2026-02-31. */
  private isRealDate(value: string): boolean {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
      return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }

  private validateObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}
