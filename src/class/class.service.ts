import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Class, ClassDocument } from './schema/class.schema';
import mongoose, { Model, Types } from 'mongoose';
import { CreateClassDto } from './dto/class.dto';
import { AssignedTeacherDto, ScheduleDto } from './dto/assignes.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { UpdateClassDto } from './dto/updateClass.dto';
import { StruckOff, StruckOffDocument } from './schema/struckoff.schema';
import { NotificationService } from 'src/notification/notification.service';
import { SubjectService } from 'src/subject/subject.service';

/**
 * A type of a schedule entry after subject resolution and period numbering —
 * i.e. exactly what gets stored on `assignes[].schedule[]`.
 */
export type ResolvedScheduleEntry = {
  day: string;
  startTime: string;
  endTime: string;
  lectureNumber: number;
  subjectId: number | null;
  subject: string | null;
};

/**
 * The only student fields a class roster is allowed to expose.
 *
 * This is an allowlist on purpose. The previous version excluded fields by name
 * (`-otp -otpExpiry -cnic -address ...`), which leaks the moment anyone adds a
 * field to the user schema and forgets to blacklist it — live OTP codes and
 * national ids were being returned to the mobile app. With an allowlist a new
 * field is private until it is deliberately listed here.
 */
const CLASS_STUDENT_FIELDS =
  'name lastName specialId class rollNo gender image isActive struckOff ' +
  'is_apply_leave is_leave_approved';

@Injectable()
export class ClassService {
  private logger = new Logger('ClassService');
  constructor(@InjectModel(Class.name)private classModel:Model<ClassDocument>, @InjectModel(User.name)private userModel:Model<UserDocument>, @InjectModel(StruckOff.name)private struckOffModel:Model<StruckOffDocument>, private notificationService: NotificationService, private subjectService: SubjectService){}

  /**
   * Turns the wire shape of a schedule entry into a stored one: resolves
   * subjects to numeric ids, and assigns period numbers when the client did
   * not send them.
   *
   * The admin portal only ever sends {day, startTime, endTime} plus a
   * top-level subject name, so requiring lectureNumber/subjectId here would
   * break every assignment made through it. Instead the values are derived:
   *
   *  - subjectId: the entry's id, else its subject name, else the
   *    assignment-level subject (id or name).
   *  - lectureNumber: honoured when sent; otherwise periods are numbered per
   *    day in start-time order, so "period 1" always means the earliest class.
   *
   * A subject name that resolves to nothing is reported in `warnings` rather
   * than rejected — the schedule is still created, just without an id to report
   * against, and the caller surfaces it to the admin.
   */
  async buildScheduleEntries(
    schedule?: ScheduleDto[],
    fallback?: { subjectId?: number; subject?: string },
  ): Promise<{ entries: ResolvedScheduleEntry[]; warnings: string[] }> {
    if (!schedule || schedule.length === 0) {
      return { entries: [], warnings: [] };
    }

    const explicitIds = schedule
      .map((s) => s.subjectId)
      .filter((id): id is number => Number.isFinite(id));
    const fallbackId = Number.isFinite(fallback?.subjectId)
      ? (fallback?.subjectId as number)
      : undefined;

    const byId = await this.subjectService.getBySubjectIds([
      ...explicitIds,
      ...(fallbackId !== undefined ? [fallbackId] : []),
    ]);
    const nameToId = new Map(byId.map((s) => [s.subjectId, s.name]));

    const candidateNames = [
      ...schedule.map((s) => s.subject).filter((n): n is string => !!n?.trim()),
      ...(fallback?.subject?.trim() ? [fallback.subject] : []),
    ];
    const resolvedNames = await this.subjectService.resolveSubjectIdsByNames(
      candidateNames,
    );

    const warnings: string[] = [];

    const entries: ResolvedScheduleEntry[] = schedule.map((slot) => {
      const entryName = slot.subject?.trim();
      const fallbackName = fallback?.subject?.trim();
      let subjectId = slot.subjectId ?? fallbackId;
      if (subjectId === undefined && entryName) subjectId = resolvedNames.get(entryName);
      if (subjectId === undefined && fallbackName) {
        subjectId = resolvedNames.get(fallbackName);
      }

      const subject =
        (subjectId !== undefined ? nameToId.get(subjectId) : undefined) ??
        entryName ??
        fallbackName ??
        null;

      if (subjectId === undefined && subject) {
        // One warning per distinct subject, not per lecture.
        const message = `"${subject}" is not in the subject list, so lectures for it will not appear in subject-wise reports. Create it via POST /subjects.`;
        if (!warnings.includes(message)) warnings.push(message);
      }

      return {
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        // Numbered below; the type demands a number even though it is blank
        // until then.
        lectureNumber: slot.lectureNumber as number,
        subjectId: subjectId ?? null,
        subject: subject ?? null,
      };
    });

    this.assignLectureNumbers(entries);

    return { entries, warnings };
  }

  /**
   * Numbers the periods that the client left blank, per day, in start-time
   * order. Explicit numbers are kept and the free slots fill the lowest numbers
   * that are still available, so a hand-numbered timetable is never renumbered
   * out from under the admin.
   */
  private assignLectureNumbers(entries: ResolvedScheduleEntry[]) {
    const byDay = new Map<string, ResolvedScheduleEntry[]>();
    for (const entry of entries) {
      const key = entry.day.trim().toLowerCase();
      const bucket = byDay.get(key) ?? [];
      bucket.push(entry);
      byDay.set(key, bucket);
    }

    for (const bucket of byDay.values()) {
      const unnumbered = bucket
        .filter((e) => !Number.isFinite(e.lectureNumber))
        .sort(
          (a, b) => this.clockToMinutes(a.startTime) - this.clockToMinutes(b.startTime),
        );

      const taken = new Set(
        bucket
          .filter((e) => Number.isFinite(e.lectureNumber))
          .map((e) => e.lectureNumber as number),
      );

      let next = 1;
      for (const entry of unnumbered) {
        while (taken.has(next)) next++;
        entry.lectureNumber = next;
        taken.add(next);
      }
    }
  }

  private clockToMinutes(value: string): number {
    const [h, m] = String(value).split(':');
    const hours = Number(h);
    const minutes = Number(m);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    return hours * 60 + minutes;
  }

  /**
   * Rejects a teacher's schedule that would collide inside a single class:
   *  - the same period twice, and
   *  - overlapping times, which would otherwise be auto-numbered as two
   *    different periods of the same class at the same moment.
   *
   * `existing` is the other teachers' schedules in this class, so a new
   * assignment cannot quietly take a slot that is already taught.
   */
  private assertScheduleConflictsFree(
    entries: ResolvedScheduleEntry[],
    assignedTeachers: {
      teacherId?: unknown;
      schedule?: { day: string; startTime: string; endTime: string }[];
    }[] = [],
    ignoreTeacherId?: string,
  ) {
    const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) =>
      this.clockToMinutes(a.startTime) < this.clockToMinutes(b.endTime) &&
      this.clockToMinutes(b.startTime) < this.clockToMinutes(a.endTime);

    const sameDay = (a: { day: string }, b: { day: string }) =>
      a.day.trim().toLowerCase() === b.day.trim().toLowerCase();

    // Flatten the other teachers' slots, skipping whoever is being re-edited.
    const others = assignedTeachers
      .filter((t) => t.teacherId?.toString() !== ignoreTeacherId)
      .flatMap((t) => t.schedule ?? []);

    const seen = new Map<string, ResolvedScheduleEntry>();
    for (const entry of entries) {
      const key = `${entry.day.trim().toLowerCase()}-${entry.lectureNumber}`;
      if (seen.has(key)) {
        throw new ConflictException(
          `Lecture ${entry.lectureNumber} on ${entry.day} is assigned twice in this class.`,
        );
      }
      seen.set(key, entry);

      const clash = others.find(
        (slot) => sameDay(slot, entry) && overlaps(slot, entry),
      );
      if (clash) {
        throw new ConflictException(
          `Another teacher already takes ${entry.day} ${entry.startTime}-${entry.endTime} in this class.`,
        );
      }
    }

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (sameDay(entries[i], entries[j]) && overlaps(entries[i], entries[j])) {
          throw new ConflictException(
            `Lectures on ${entries[i].day} overlap: ${entries[i].startTime}-${entries[i].endTime} and ${entries[j].startTime}-${entries[j].endTime}.`,
          );
        }
      }
    }
  }


  // ✅ Parse date safely as UTC calendar date
parseDateToUTCRange(dateStr: string): {
  dayStart: Date;
  dayEnd: Date;
  dayName: string;
} {
  const [year, month, day] = dateStr.split('-').map(Number);

  const dayStart = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0, 0),
  );

  const dayEnd = new Date(
    Date.UTC(year, month - 1, day, 23, 59, 59, 999),
  );

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  const dayName = dayNames[dayStart.getUTCDay()];

  return { dayStart, dayEnd, dayName };
}

// ✅ Current time in PKT (UTC+5)
getNowInPKT(): { nowTotal: number; pktTodayStr: string } {
  const now = new Date();

  const utcMinutes =
    now.getUTCHours() * 60 + now.getUTCMinutes();

  const pktOffset = 5 * 60;

  const pktMinutes =
    (utcMinutes + pktOffset) % (24 * 60);

  const pktNow = new Date(
    now.getTime() + 5 * 60 * 60 * 1000,
  );

  return {
    nowTotal: pktMinutes,
    pktTodayStr: pktNow.toISOString().split('T')[0],
  };
}

  async getClasses(category?:string,department?:string){
    let filter ={};
    if(category) filter={category};
    if(department) filter={departmentId:department};
    if(category && department) filter={category,departmentId:department}
    const classes=await this.classModel.find(filter).lean().populate({path:"classStudents",select:CLASS_STUDENT_FIELDS}).populate({
    path: "departmentId", select:"code _id category"
  }).populate({path:"assignes.teacherId",select:"name"});
    if(classes.length===0){
      return "No Class created";
    }

    return classes;
  }

  async getMyClasses(teacherId){
       const classes=await this.classModel.find({"assignes.teacherId": teacherId}).lean().populate({path:"classStudents",select:CLASS_STUDENT_FIELDS}).populate({
    path: "departmentId",
  }).populate({path:"assignes.teacherId",select:"name"});
if(classes.length==0){
     // Always an array: the mobile app maps over this response, so returning a
     // string here crashed it for any teacher with no classes.
     return [];
   }

   return this.withSubjectDetails(classes);
 }

 /**
  * Attaches a flat per-lecture list (subjectId + resolved subject name) to each
  * class so the app does not have to walk the nested assignes array itself.
  */
 private async withSubjectDetails(classes: any[]) {
   const subjectIds = classes.flatMap((c) =>
     (c.assignes ?? []).flatMap((a: any) => [
       ...(typeof a.subjectId === 'number' ? [a.subjectId] : []),
       ...((a.schedule ?? [])
         .map((s: any) => s.subjectId)
         .filter((id: unknown) => typeof id === 'number')),
     ]),
   );

   const subjectMap = await this.subjectService.getMapBySubjectIds(subjectIds);

   return classes.map((c) => ({ ...c, todayLectures: this.flattenLectures(c, subjectMap) }));
 }

private flattenLectures(
   cls: any,
   subjectMap: Map<number, { name: string | null; code: string | null }>,
 ) {
   const lectures = (cls.assignes ?? []).flatMap((a: any) => {
     const teacher = a.teacherId?._id ?? a.teacherId;
     const teacherName = a.teacherId?.name ?? null;

     return (a.schedule ?? []).map((s: any, index: number) => {
       const subjectId = typeof s.subjectId === 'number' ? s.subjectId : a.subjectId ?? null;
       const resolved = subjectId !== null ? subjectMap.get(subjectId) : undefined;

       return {
         day: s.day,
         startTime: s.startTime,
         endTime: s.endTime,
         lectureNumber: s.lectureNumber ?? index + 1,
         subjectId,
         subject: resolved?.name ?? s.subject ?? a.subject ?? null,
         subjectCode: resolved?.code ?? null,
         teacherId: teacher ? String(teacher) : null,
         teacherName,
       };
     });
   });

   return lectures.sort((x, y) => {
     if (x.day !== y.day) return x.day.localeCompare(y.day);
     return x.startTime.localeCompare(y.startTime);
   });
 }

  
  async createClass(dto: CreateClassDto, createdBy: string) {
  try {
    if (dto.category === 'intermediate' && !['I', 'II'].includes(dto.class)) {
      throw new BadRequestException('Class must be I or II for intermediate');
    }

    const isExist = await this.classModel.exists({ className: dto.className });
    if (isExist) throw new ConflictException('Class of similar name already exists.');

    const mongoFormat=new mongoose.Types.ObjectId(createdBy);

    const newClass = new this.classModel({
      ...dto,
      createdBy:mongoFormat,
    });

    await newClass.save();

    // 🔔 Notify admin/hod/principal about the new class
    this.getSenderInfo(createdBy).then((actor) => {
      this.notifyStaff(
        actor,
        'Class Created',
        `New class ${newClass.className} has been created.`,
        { classId: newClass._id.toString(), className: newClass.className },
        newClass.className,
      );
    }).catch((err) => this.logger.error(`Class created notification failed: ${err}`));

    return { message: 'Class created successfully', newClass };

  } catch (error) {
    if (error instanceof BadRequestException || error instanceof ConflictException) throw error;

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e: any) => e.message);
      throw new BadRequestException({ message: 'Validation failed', errors: messages });
    }

    throw new InternalServerErrorException('Something went wrong');
  }
}

async getClassInfo(classId:string){
  const isExist=await this.classModel.findById(classId).lean().populate("departmentId").populate({
    path: "assignes.teacherId",
    select: "name" // only fetch firstName
  });
  if(!isExist){
    throw new NotFoundException("Class doesn't exist");
  }

  return {
    isExist
  }
}

async getClassStudentList(classId:string){
  const isExist=await this.classModel.findById(classId,{classStudents:1}).lean().populate({path:"classStudents",select:CLASS_STUDENT_FIELDS});

  if(!isExist){
    throw new NotFoundException("Class doesn't exist");
  }

  const classStudents=isExist?.classStudents;
  if(classStudents?.length===0){
    throw new BadRequestException("Class has no students.")
  }

  return {
    classStudents
  }
}

async getAssignedTeacherList(classId:string){
  const isExist=await this.classModel.findById(classId,{assignes:1}).lean();
  if(!isExist){
    throw new NotFoundException('Class doesnt exist');
  }

  const assignedTeachers=isExist?.assignes;

  if(assignedTeachers?.length===0){
    throw new BadRequestException('Class has no teachers assigned.');
  }

  return {
    assignedTeachers
  }
}



  async addTeacherInClass(dto: AssignedTeacherDto, classId: string, actionBy: string) {
  const classTeachers = await this.checkTeachers(classId, dto.teacherId);
  const isExistInClass = classTeachers?.find(
    (teacher) =>
      teacher.teacherId.toString() === dto.teacherId ||
      (dto.subjectId !== undefined && teacher.subjectId === dto.subjectId) ||
      (dto.subjectId === undefined && teacher.subject === dto.subject),
  );

  if (isExistInClass) {
    throw new ConflictException("Teacher already exists in this class for that subject");
  }

  const { entries: scheduleEntries, warnings } = await this.buildScheduleEntries(
    dto.schedule,
    { subjectId: dto.subjectId, subject: dto.subject },
  );

  const classDoc = await this.classModel
    .findById(classId)
    .select('assignes')
    .lean();
  this.assertScheduleConflictsFree(
    scheduleEntries,
    classDoc?.assignes ?? [],
    dto.teacherId,
  );

  // Fall back to the first lecture's subject when the caller only sent a
  // top-level subject name, so older clients keep working.
  let subjectId = dto.subjectId;
  let subjectName = dto.subject;
  if (subjectId === undefined && scheduleEntries.length > 0) {
    subjectId = scheduleEntries[0].subjectId ?? undefined;
  }
  if (subjectId !== undefined && !subjectName) {
    subjectName =
      scheduleEntries.find((e) => e.subjectId === subjectId)?.subject ??
      (await this.subjectService.getBySubjectIds([subjectId]))[0]?.name ??
      undefined;
  }
  if (subjectId === undefined && !subjectName && scheduleEntries.length > 0) {
    subjectName = scheduleEntries[0].subject ?? undefined;
  }
  if (subjectId === undefined && !subjectName) {
    throw new BadRequestException('Provide a subject for the assignment');
  }

  const [cls, teacher, actor] = await Promise.all([
    this.classModel.findById(classId).select('className').lean(),
    this.userModel.findById(dto.teacherId).select('name lastName').lean(),
    this.getSenderInfo(actionBy),
  ]);

  await this.classModel.findByIdAndUpdate(
    { _id: classId },
    {
      $push: {
        assignes: {
          teacherId: dto.teacherId,
          subjectId,
          subject:   subjectName,
          schedule:  scheduleEntries,
        },
      },
    },
    { new: true }
  );

  const className = (cls as any)?.className ?? 'Class';
  const teacherName = teacher
    ? [teacher.name, teacher.lastName].filter(Boolean).join(' ')
    : 'Teacher';
  const displaySubject = subjectName ?? `Subject #${subjectId}`;

  // 🔔 Notify the assigned teacher
  this.notificationService
    .create({
      userId: dto.teacherId,
      ...actor,
      type: 'class',
      title: 'Class Assigned',
      message: `You have been assigned to teach ${displaySubject} in ${className}.`,
      data: {
        classId,
        className: className,
        ...(subjectId !== undefined ? { subjectId } : {}),
        subject: displaySubject,
      },
      classNames: [className],
    })
    .catch((err) => this.logger.error(`Teacher assigned notification failed: ${err}`));

  // 🔔 Notify admin/hod/principal
  this.notifyStaff(
    actor,
    'Teacher Added to Class',
    `${teacherName} has been added to teach ${displaySubject} in ${className}.`,
    { classId, className: className, ...(subjectId !== undefined ? { subjectId } : {}) },
    className,
    dto.teacherId,
  );

  return {
    message: "Teacher assigned successfully",
    subjectId: subjectId ?? null,
    schedule: scheduleEntries,
    // Non-fatal: a subject name the catalogue does not know yet, so the admin
    // can create it instead of the assignment silently missing reports.
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async updateTeacherSchedule(classId: string, teacherId: string, schedule: ScheduleDto[], actionBy: string) {
  const classTeachers = await this.checkTeachers(classId, teacherId);
  
  const teacherIndex = classTeachers?.findIndex(
    (t) => t.teacherId.toString() === teacherId
  );

  if (teacherIndex === -1 || teacherIndex === undefined) {
    throw new NotFoundException("Teacher is not assigned to this class");
  }

  if (!schedule || schedule.length === 0) {
    throw new BadRequestException("Schedule cannot be empty");
  }

  const { entries: scheduleEntries, warnings } = await this.buildScheduleEntries(
    schedule,
    {
      subjectId: classTeachers?.[teacherIndex]?.subjectId,
      subject: classTeachers?.[teacherIndex]?.subject,
    },
  );

  const classDoc = await this.classModel
    .findById(classId)
    .select('assignes')
    .lean();
  this.assertScheduleConflictsFree(
    scheduleEntries,
    classDoc?.assignes ?? [],
    teacherId,
  );

  // ✅ Update schedule of the specific teacher using positional operator
  await this.classModel.findByIdAndUpdate(
    classId,
    {
      $set: {
        [`assignes.${teacherIndex}.schedule`]: scheduleEntries,
      },
    },
    { new: true }
  );

  const className = ((await this.classModel.findById(classId).select('className').lean()) as any)?.className ?? 'Class';
  const actor = await this.getSenderInfo(actionBy);

  // 🔔 Notify the teacher
  this.notificationService
    .create({
      userId: teacherId,
      ...actor,
      type: 'class',
      title: 'Schedule Updated',
      message: `Your schedule for ${className} has been updated.`,
      data: { classId, className: className },
      classNames: [className],
    })
    .catch((err) => this.logger.error(`Teacher schedule notification failed: ${err}`));

  // 🔔 Notify admin/hod/principal
  this.notifyStaff(
    actor,
    'Teacher Schedule Updated',
    `A teacher's schedule has been updated in ${className}.`,
    { classId, className: className },
    className,
    teacherId,
  );

  return {
    message: "Schedule updated successfully",
    schedule: scheduleEntries,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async addTeacherSchedule(
  classId: string,
  teacherId: string,
  schedule: ScheduleDto[],
  actionBy: string,
) {
  const classTeachers = await this.checkTeachers(classId, teacherId);

  // ✅ Guard against undefined
  if (!classTeachers || classTeachers.length === 0) {
    throw new NotFoundException("No teachers assigned to this class");
  }

  const teacherIndex = classTeachers.findIndex(
    (t) => t.teacherId.toString() === teacherId
  );

  if (teacherIndex === -1) {
    throw new NotFoundException("Teacher is not assigned to this class");
  }

  if (!schedule || schedule.length === 0) {
    throw new BadRequestException("Schedule cannot be empty");
  }

  const existingDays = classTeachers[teacherIndex].schedule?.map((s) => s.day) ?? [];
  const incomingDays = schedule.map((s) => s.day);
  const duplicates   = incomingDays.filter((d) => existingDays.includes(d));

  if (duplicates.length > 0) {
    throw new ConflictException(
      `Schedule already exists for: ${duplicates.join(", ")}`
    );
  }

  const { entries: scheduleEntries, warnings } = await this.buildScheduleEntries(
    schedule,
    {
      subjectId: classTeachers[teacherIndex].subjectId,
      subject: classTeachers[teacherIndex].subject,
    },
  );

  const classDoc = await this.classModel
    .findById(classId)
    .select('assignes')
    .lean();
  this.assertScheduleConflictsFree(
    scheduleEntries,
    classDoc?.assignes ?? [],
    teacherId,
  );

  await this.classModel.findByIdAndUpdate(
    classId,
    {
      $push: {
        [`assignes.${teacherIndex}.schedule`]: { $each: scheduleEntries },
      },
    },
    { new: true }
  );

  const className = ((await this.classModel.findById(classId).select('className').lean()) as any)?.className ?? 'Class';
  const actor = await this.getSenderInfo(actionBy);

  // 🔔 Notify the teacher
  this.notificationService
    .create({
      userId: teacherId,
      ...actor,
      type: 'class',
      title: 'Schedule Updated',
      message: `New schedule has been added for your classes in ${className}.`,
      data: { classId, className: className },
      classNames: [className],
    })
    .catch((err) => this.logger.error(`Teacher schedule notification failed: ${err}`));

  // 🔔 Notify admin/hod/principal
  this.notifyStaff(
    actor,
    'Teacher Schedule Added',
    `New schedule entries have been added in ${className}.`,
    { classId, className: className },
    className,
    teacherId,
  );

  return {
    message: "Schedule entries added successfully",
    schedule: scheduleEntries,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

  async addStudentInClass(classId:string,studentId:string,actionBy:string){
    const allStudents=await this.checkStudents(classId,studentId);
    const isExists=allStudents?.find(student=>student.toString()===studentId);
    if(isExists){
      throw new ConflictException("Student already exists");
    }

    const [cls, student, actor] = await Promise.all([
      this.classModel.findById(classId).select('className').lean(),
      this.userModel.findById(studentId).select('name lastName').lean(),
      this.getSenderInfo(actionBy),
    ]);

    await this.classModel.findByIdAndUpdate(classId,{$addToSet:{classStudents:studentId}},{new:false});

    const className = (cls as any)?.className ?? 'Class';
    const studentName = student
      ? [student.name, student.lastName].filter(Boolean).join(' ')
      : 'A student';

    // 🔔 Notify the student
    this.notificationService
      .create({
        userId: studentId,
        ...actor,
        type: 'class',
        title: 'Added to Class',
        message: `You have been added to ${className}.`,
        data: { classId, className: className },
        classNames: [className],
      })
      .catch((err) => this.logger.error(`Student added notification failed: ${err}`));

    // 🔔 Notify admin/hod/principal
    this.notifyStaff(
      actor,
      'Student Added to Class',
      `${studentName} has been added to ${className}.`,
      { classId, className: className },
      className,
      studentId,
    );

    return {
      message:"Student added successfully"
    }
  }

  async removeStudentFromClass(classId:string,studentId:string,actionBy:string){
    const allStudents=await this.checkStudents(classId,studentId);
    const isExists=allStudents?.find(student=>student.toString()===studentId);
    if(!isExists){
      throw new ConflictException("Student doesn't exist");
    }

    const [cls, student, actor] = await Promise.all([
      this.classModel.findById(classId).select('className').lean(),
      this.userModel.findById(studentId).select('name lastName').lean(),
      this.getSenderInfo(actionBy),
    ]);

    await this.classModel.findByIdAndUpdate(classId,{$pull:{classStudents:isExists}},{new:false});

    const className = (cls as any)?.className ?? 'Class';
    const studentName = student
      ? [student.name, student.lastName].filter(Boolean).join(' ')
      : 'A student';

    // 🔔 Notify the student
    this.notificationService
      .create({
        userId: studentId,
        ...actor,
        type: 'class',
        title: 'Removed from Class',
        message: `You have been removed from ${className}.`,
        data: { classId, className: className },
        classNames: [className],
      })
      .catch((err) => this.logger.error(`Student removed notification failed: ${err}`));

    // 🔔 Notify admin/hod/principal
    this.notifyStaff(
      actor,
      'Student Removed from Class',
      `${studentName} has been removed from ${className}.`,
      { classId, className: className },
      className,
      studentId,
    );

    return {
      message:"Student has been removed from class",
    }
  }

  async struckOffStudent(classId: string, studentId: string, actionBy: string, dto: any) {
  try {
    this.validateObjectId(classId, 'Invalid class ID');
    this.validateObjectId(studentId, 'Invalid student ID');
    this.validateObjectId(actionBy, 'Invalid action user ID');

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Reason is required');
    }

    let classObjectId = new Types.ObjectId(classId);
    let studentObjectId = new Types.ObjectId(studentId);

    // 1. Fetch and validate existing data in parallel
    let [student, cls, existingRecord] = await Promise.all([
      this.userModel.exists({ _id: studentObjectId, role: 'student' }),
      this.classModel.findById(classObjectId, { classStudents: 1, className: 1 }).lean(),
      this.struckOffModel.findOne({ studentId: studentObjectId }).lean(),
    ]);

    // Be tolerant of clients accidentally sending /:studentId/:classId.
    if (!student || !cls) {
      const [swappedStudent, swappedClass, swappedRecord] = await Promise.all([
        this.userModel.exists({ _id: classObjectId, role: 'student' }),
        this.classModel.findById(studentObjectId, { classStudents: 1, className: 1 }).lean(),
        this.struckOffModel.findOne({ studentId: classObjectId }).lean(),
      ]);

      if (swappedStudent && swappedClass) {
        [classId, studentId] = [studentId, classId];
        [classObjectId, studentObjectId] = [studentObjectId, classObjectId];
        [student, cls, existingRecord] = [swappedStudent, swappedClass, swappedRecord];
      }
    }

    if (!student) {
      throw new UnauthorizedException('Invalid Student');
    }

    if (!cls) {
      throw new NotFoundException("Class doesn't exist");
    }

    if (existingRecord?.currentStatus?.status === 'struck_off') {
      throw new ConflictException('Student is already struck off');
    }

    const isEnrolled = cls.classStudents?.some((id) => id.toString() === studentObjectId.toString());
    if (!isEnrolled) {
      throw new ConflictException("Student doesn't exist in this class");
    }

    // 2. Prepare the log data structure
    const statusLog = {
      status: 'struck_off',
      reason: dto.reason.trim(),
     start: dto.start
  ? this.parseDateToUTCRange(dto.start).dayStart
  : new Date(), // Ensures valid date format
      end: dto.end
  ? this.parseDateToUTCRange(dto.end).dayEnd
  : null,
      actionBy: new Types.ObjectId(actionBy),
    };

    // 3. Update struck-off status without removing the student from the class
    const [struckOffRecord] = await Promise.all([
      this.struckOffModel.findOneAndUpdate(
        { studentId: studentObjectId },
        {
          $set: { currentStatus: statusLog },
          $push: { history: statusLog },
          $setOnInsert: { studentId: studentObjectId },
        },
        { new: true, upsert: true, runValidators: true },
      ).populate({ 
        path: 'studentId', 
        select: 'name lastName specialId email rollNo class session category department' 
      }),

      this.userModel.findByIdAndUpdate(
        studentObjectId,
        { $set: { struckOff: true } }
      ),
    ]);

    // 🔔 Notify the struck-off student (informational, mobile shows default detail)
    const reason = dto.reason.trim();
    const className = (cls as any)?.className ?? 'your class';

    this.notificationService
      .create({
        userId: studentObjectId.toString(),
        senderId: actionBy,
        senderName: 'Admin',
        senderRole: 'admin',
        type: 'general',
        title: 'Struck Off',
        message: `You have been struck off from ${className}. Reason: ${reason}`,
        data: {
          classId,
          className,
          reason,
        },
        classNames: [],
      })
      .catch((err) => this.logger.error(`Struck-off student notification failed: ${err}`));

    // 🔔 Notify admin/hod/proff (their StruckOffStudentsScreen can open this list)
    const staff = await this.userModel
      .find({ role: { $in: ['admin', 'hod', 'proff'] } })
      .select('_id')
      .lean();

    if (staff.length > 0) {
      this.notificationService
        .createBulk({
          userIds: staff.map((s) => s._id.toString()),
          senderId: actionBy,
          senderName: 'Admin',
          senderRole: 'admin',
          type: 'general',
          title: 'Student Struck Off',
          message: `A student has been struck off from ${className}. Reason: ${reason}`,
          data: {
            notification_type: '1',
            classId,
            className,
            reason,
          },
          classNames: [className],
        })
        .catch((err) => this.logger.error(`Struck-off staff notification failed: ${err}`));
    }

    return {
      message: 'Student has been struck off successfully',
      struckOffRecord,
    };
  } catch (error) {
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException ||
      error instanceof UnauthorizedException
    ) {
      throw error;
    }

    if (error?.code === 11000) {
      throw new ConflictException('Student struck off record already exists');
    }

    if (error?.name === 'CastError') {
      throw new BadRequestException('Invalid ID provided');
    }

    throw new InternalServerErrorException('Unable to struck off student');
  }
}


  async identifyStruckOffStudent(studentId:string){
    try {
      this.validateObjectId(studentId, 'Invalid student ID');

      const student = await this.findStudent(studentId);
      if (!student) {
        throw new UnauthorizedException('Invalid Student');
      }

      const struckOffRecord = await this.struckOffModel
        .findOne({studentId:student})
        .lean()
        .populate({ path: 'studentId', select: 'name lastName specialId email rollNo class session category department' })
        .populate({ path: 'currentStatus.actionBy', select: 'name lastName specialId role' })
        .populate({ path: 'history.actionBy', select: 'name lastName specialId role' });
      return {
        isStruckOff: Boolean(struckOffRecord),
        struckOffRecord,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      if (error?.name === 'CastError') {
        throw new BadRequestException('Invalid ID provided');
      }

      throw new InternalServerErrorException('Unable to identify struck off student');
    }
  }

  async unStruckOffStudent(studentId: string, actionBy: string, reason?: string) {
  try {
    this.validateObjectId(studentId, 'Invalid student ID');
    this.validateObjectId(actionBy,  'Invalid action user ID');

    const studentObjectId = new Types.ObjectId(studentId);
    const actionByObjectId = new Types.ObjectId(actionBy);

    // ✅ Fetch student and existing struck off record in parallel
    const [student, existingRecord, actor] = await Promise.all([
      this.userModel.findOne({ _id: studentObjectId, role: 'student' }).select('_id department').lean(),
      this.struckOffModel.findOne({ studentId: studentObjectId }).lean(),
      this.userModel.findById(actionByObjectId).select('_id role isHod department').lean(),
    ]);

    if (!student) {
      throw new UnauthorizedException('Invalid Student');
    }

    if (!actor) {
      throw new UnauthorizedException('Invalid action user');
    }

    if (!existingRecord) {
      throw new NotFoundException('No struck off record found for this student');
    }

    if (existingRecord.currentStatus?.status !== 'struck_off') {
      throw new ConflictException('Student is not currently struck off');
    }

    const currentActionBy = existingRecord.currentStatus.actionBy?.toString();
    const actorDepartment = actor.department?.toString();
    const studentDepartment = student.department?.toString();
    const canReinstate =
      actor.role === 'admin' ||
      (actor.isHod === true && actorDepartment && actorDepartment === studentDepartment) ||
      currentActionBy === actionByObjectId.toString();

    if (!canReinstate) {
      throw new ForbiddenException('Only the user who struck off this student, admin, or department HOD can reinstate them');
    }

    // ✅ Reinstatement log — record the end date on history entry and clear currentStatus
    const reinstateLog = {
      status:   'reinstated',
      reason:   reason?.trim() ?? '',
      start:    null,  // ✅ cleared
      end:      null,  // ✅ cleared
      actionBy: actionByObjectId,
    };

    const [updatedRecord] = await Promise.all([
      this.struckOffModel.findOneAndUpdate(
        { studentId: studentObjectId },
        {
          $set:  { currentStatus: null },
          $push: { history: reinstateLog },
        },
        { new: true },
      ).populate({
        path:   'studentId',
        select: 'name lastName specialId email rollNo class session category department',
      }).populate({
        path: 'history.actionBy',
        select: 'name lastName specialId role',
      }),

      this.userModel.findByIdAndUpdate(
        studentObjectId,
        { $set: { struckOff: false } },
      ),
    ]);

    // 🔔 Notify the reinstated student
    this.notificationService
      .create({
        userId: studentObjectId.toString(),
        senderId: actionBy,
        senderName: actor.name || 'Admin',
        senderRole: actor.role || 'admin',
        type: 'class',
        title: 'Reinstated',
        message: `You have been reinstated.${reason ? ` Reason: ${reason}` : ''}`,
        data: {
          studentId,
          reason,
        },
        classNames: [],
      })
      .catch((err) => this.logger.error(`Reinstated student notification failed: ${err}`));

    // 🔔 Notify admin/hod/principal
    const reinstatedBy = {
      senderId: actionBy,
      senderName: actor.name || 'Admin',
      senderRole: actor.role || 'admin',
    };
    this.notifyStaff(
      reinstatedBy,
      'Student Reinstated',
      `A student has been reinstated.${reason ? ` Reason: ${reason}` : ''}`,
      { studentId, reason },
      undefined,
      studentId,
    );

    return {
      message:       'Student has been reinstated successfully',
      updatedRecord,
    };

  } catch (error) {
    if (
      error instanceof BadRequestException  ||
      error instanceof ConflictException    ||
      error instanceof NotFoundException    ||
      error instanceof ForbiddenException   ||
      error instanceof UnauthorizedException
    ) {
      throw error;
    }

    if (error?.name === 'CastError') {
      throw new BadRequestException('Invalid ID provided');
    }

    throw new InternalServerErrorException('Unable to reinstate student');
  }
}

  private getPagination(page?: number, limit?: number) {
    const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 25;
    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  async getStruckOffStudents(page?: number, limit?: number){
    try {
      const pagination = this.getPagination(page, limit);
      const filter = { 'currentStatus.status': 'struck_off' };
      const [total, struckOffStudents] = await Promise.all([
        this.struckOffModel.countDocuments(filter),
        this.struckOffModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean()
        .populate({ path: 'studentId', select: 'name lastName specialId email rollNo class session category department' })
        .populate({ path: 'currentStatus.actionBy', select: 'name lastName specialId role' })
        .populate({ path: 'history.actionBy', select: 'name lastName specialId role' }),
      ]);

      return {
        count: struckOffStudents.length,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
        struckOffStudents,
      };
    } catch (error) {
      if (error?.name === 'CastError') {
        throw new BadRequestException('Invalid ID provided');
      }

      throw new InternalServerErrorException('Unable to get struck off students');
    }
  }

  async getStruckOffRecords(studentIds: string[], page?: number, limit?: number) {
    try {
      const validIds = [...new Set(studentIds || [])].filter((id) => Types.ObjectId.isValid(id));
      if (validIds.length === 0) {
        return { count: 0, total: 0, page: 1, limit: 25, totalPages: 1, struckOffRecords: [] };
      }

      const pagination = this.getPagination(page, limit);
      const filter = { studentId: { $in: validIds.map((id) => new Types.ObjectId(id)) } };
      const [total, struckOffRecords] = await Promise.all([
        this.struckOffModel.countDocuments(filter),
        this.struckOffModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean()
        .populate({ path: 'studentId', select: 'name lastName specialId email rollNo class session category department struckOff' })
        .populate({ path: 'currentStatus.actionBy', select: 'name lastName specialId role' })
        .populate({ path: 'history.actionBy', select: 'name lastName specialId role' }),
      ]);

      return {
        count: struckOffRecords.length,
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
        struckOffRecords,
      };
    } catch (error) {
      if (error?.name === 'CastError') {
        throw new BadRequestException('Invalid ID provided');
      }

      throw new InternalServerErrorException('Unable to get struck off records');
    }
  }


  async removeTeacherFromClass(classId:string,teacherId:string,actionBy:string){
    const classTeachers=await this.checkTeachers(classId,teacherId);
    const isExistInClass=classTeachers?.find(teacher => teacher.teacherId.toString()===teacherId);
    
    if(!isExistInClass){
      throw new ConflictException("Teacher doesn't exist in class");
    }

    const [cls, teacher, actor] = await Promise.all([
      this.classModel.findById(classId).select('className').lean(),
      this.userModel.findById(teacherId).select('name lastName').lean(),
      this.getSenderInfo(actionBy),
    ]);

    await this.classModel.findByIdAndUpdate(classId,{$pull:{assignes:{teacherId}}},{new:false});

    const className = (cls as any)?.className ?? 'Class';
    const teacherName = teacher
      ? [teacher.name, teacher.lastName].filter(Boolean).join(' ')
      : 'A teacher';

    // 🔔 Notify the removed teacher
    this.notificationService
      .create({
        userId: teacherId,
        ...actor,
        type: 'class',
        title: 'Removed from Class',
        message: `You have been removed from ${className}.`,
        data: { classId, className: className },
        classNames: [className],
      })
      .catch((err) => this.logger.error(`Teacher removed notification failed: ${err}`));

    // 🔔 Notify admin/hod/principal
    this.notifyStaff(
      actor,
      'Teacher Removed from Class',
      `${teacherName} has been removed from ${className}.`,
      { classId, className: className },
      className,
      teacherId,
    );

    return {
      message:"Teacher removed",
    }
  }
  async updateAssignedTeacher(classId: string, teacherId: string, dto: Partial<AssignedTeacherDto>, actionBy: string) {
  const cls = await this.classModel.findById(classId);
  if (!cls) throw new NotFoundException("Class not found");

  const index = cls.assignes?.findIndex(
    (a) => a.teacherId.toString() === teacherId
  );
  if (index === -1 || index === undefined) {
    throw new NotFoundException("Teacher not assigned to this class");
    
  }
  if (!cls.assignes || cls.assignes.length === 0) {
  throw new NotFoundException("No teachers assigned to this class");
}

  if (dto.subject)  cls.assignes[index].subject  = dto.subject;
  if (dto.schedule) cls.assignes[index].schedule = dto.schedule;

  cls.markModified("assignes"); // ✅ required for nested array updates
  await cls.save();

  const actor = await this.getSenderInfo(actionBy);

  // 🔔 Notify the teacher
  this.notificationService
    .create({
      userId: teacherId,
      ...actor,
      type: 'class',
      title: 'Assignment Updated',
      message: `Your teaching assignment in ${cls.className} has been updated.`,
      data: {
        classId,
        className: cls.className,
        ...(dto.subject ? { subject: dto.subject } : {}),
      },
      classNames: [cls.className],
    })
    .catch((err) => this.logger.error(`Assignment update notification failed: ${err}`));

  // 🔔 Notify admin/hod/principal
  this.notifyStaff(
    actor,
    'Teacher Assignment Updated',
    `A teacher's assignment has been updated in ${cls.className}.`,
    { classId, className: cls.className },
    cls.className,
    teacherId,
  );

  return { message: "Assignment updated successfully", class: cls };
}

  async updateClassCredentials(classId:string,dto:UpdateClassDto,actionBy:string){
      const updateData:any={};
      if(dto?.class!==undefined) updateData.class=dto.class;
      if(dto?.session!==undefined) updateData.session=dto.session;

      if(Object.keys(updateData).length===0){
        throw new BadRequestException("Empty fields provided");
      }

      const cls = await this.classModel.findById(classId).select('className').lean();
      await this.classModel.findByIdAndUpdate(classId,{$set:updateData},{new:false});

      const className = (cls as any)?.className ?? 'Class';
      const actor = await this.getSenderInfo(actionBy);

      // 🔔 Notify admin/hod/principal
      this.notifyStaff(
        actor,
        'Class Updated',
        `Details of ${className} have been updated.`,
        { classId, className: className },
        className,
      );

      return {
        message:"Updated"
      }
  }

  async checkTeachers(classId:string,teacherId:string){
    const [isExist, teachers] = await Promise.all([
      this.findTeacher(teacherId),
      this.classModel.findById(classId,{assignes:1,_id:0}).lean(),
    ]);
    if(!isExist){
      throw new UnauthorizedException("Invalid Teacher");
    }
    return teachers?.assignes;
  }

  async checkStudents(classId:string,studentId:string){
    const [isExist, cls] = await Promise.all([
      this.findStudent(studentId),
      this.classModel.findById(classId,{classStudents:1,_id:0}).lean(),
    ]);
     if(!isExist){
      throw new UnauthorizedException("Invalid Student");
    }
    return cls?.classStudents;
  }

  // 🔔 Resolve actor identity for notification sender
  private async getSenderInfo(actorId: string) {
    const actor = await this.userModel
      .findById(actorId)
      .select('name lastName role')
      .lean();
    return {
      senderId: actorId,
      senderName: actor
        ? [actor.name, actor.lastName].filter(Boolean).join(' ')
        : 'Admin',
      senderRole: actor?.role ?? 'admin',
    };
  }

  // 🔔 Get all admins + HODs + principal who should see class updates
  private async getStaffIds(): Promise<string[]> {
    const staff = await this.userModel
      .find({ $or: [{ role: 'admin' }, { isHod: true }, { isPrincipal: true }] })
      .select('_id')
      .lean();
    return staff.map((s) => s._id.toString());
  }

  // 🔔 Notify all admin/HOD/principal users (fire-and-forget)
  // excludeUserId - jo teacher/student affected hai, use staff list se hatane ke liye
  private notifyStaff(
    actor: { senderId: string; senderName: string; senderRole: string },
    title: string,
    message: string,
    data: Record<string, any>,
    className?: string,
    excludeUserId?: string,
  ) {
    this.getStaffIds()
      .then((staffIds) => {
        const recipients = excludeUserId
          ? staffIds.filter((id) => id !== excludeUserId)
          : staffIds;
        if (recipients.length === 0) return;
        return this.notificationService.createBulk({
          userIds: recipients,
          senderId: actor.senderId,
          senderName: actor.senderName,
          senderRole: actor.senderRole,
          type: 'class',
          title,
          message,
          data,
          classNames: className ? [className] : [],
        });
      })
      .catch((err) => this.logger.error(`${title} staff notification failed: ${err}`));
  }

  private async findTeacher(id:string){
    const teacher=await this.userModel.exists({_id:id,role:'proff'});
    return teacher?._id ?? null;
  }

  private async findStudent(id:string){
    const student=await this.userModel.exists({_id:id,role:'student'});
    return student?._id ?? null;
  }

  private validateObjectId(id:string, message:string){
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}
