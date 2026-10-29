/**
 * 📚 ASSIGNMENT SERVICE
 * =====================
 * Teachers and HODs publish assignments for a class; students submit written
 * answers and/or files and the teacher grades them. Students may resubmit at
 * any time (late submissions are allowed unless the assignment forbids them);
 * a resubmission clears the previous grade so the teacher grades the new copy.
 *
 * Notifications reuse the `general` type and route through
 * `data.notification_type` codes 25/26/27, matching how the fee/leave modules
 * already deep-link in the Flutter app.
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
  Assignment,
  AssignmentDocument,
} from './schema/assignment.schema';
import { Submission, SubmissionDocument } from './schema/submission.schema';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { NotificationService } from 'src/notification/notification.service';
import {
  CreateAssignmentDto,
  GradeSubmissionDto,
  SubmitAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';
import {
  ASSIGNMENT_GRADED_NOTIFICATION_TYPE,
  ASSIGNMENT_NOTIFICATION_TYPE,
  ASSIGNMENT_SUBMITTED_NOTIFICATION_TYPE,
} from './assignment.constants';
import { AssignmentFileService } from './assignment-file.service';

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
  assignes?: { teacherId?: Types.ObjectId; subjectId?: number; subject?: string }[];
};

type ListQuery = {
  classId?: string;
  status?: string;
  page?: string;
  limit?: string;
};

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Submission.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(Class.name)
    private readonly classModel: Model<ClassDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
    private readonly fileService: AssignmentFileService,
  ) {}

  // ============================================================
  // FILE UPLOAD
  // ============================================================

  /**
   * Stores one attachment for the caller and returns the id to send back in
   * `fileIds` when creating an assignment or submitting work.
   */
  async uploadFile(actorId: string, file: Express.Multer.File) {
    await this.getActor(actorId);
    const stored = await this.fileService.save(actorId, file);
    return {
      fileId: stored.fileId.toString(),
      name: stored.name,
      mime: stored.mime,
      size: stored.size,
    };
  }

  // ============================================================
  // CREATE
  // ============================================================

  async create(actorId: string, dto: CreateAssignmentDto) {
    const cls = await this.getClassLite(dto.classId);
    const actor = await this.getActor(actorId);

    if (!this.isClassManager(actor, cls)) {
      throw new ForbiddenException(
        'You can only create assignments for classes you teach',
      );
    }

    const title = (dto.title ?? '').trim();
    if (!title) throw new BadRequestException('Title is required');

    const dueAt = this.parseDate(dto.dueAt);
    const maxMarks = this.parseMaxMarks(dto.maxMarks);
    const attachments = await this.fileService.resolveOwned(
      actorId,
      dto.fileIds ?? [],
    );

    const assignment = await this.assignmentModel.create({
      classId: cls._id,
      className: cls.className,
      departmentId: cls.departmentId ?? undefined,
      subjectId: dto.subjectId ?? undefined,
      subject: this.resolveSubjectName(cls, dto.subjectId, dto.subject),
      title,
      description: (dto.description ?? '').trim(),
      attachments,
      dueAt,
      maxMarks,
      allowLate: dto.allowLate !== false,
      status: dto.status ?? 'published',
      createdBy: actor._id,
      createdByName: this.actorName(actor),
    });

    if (dto.notify !== false) {
      await this.notifyStudents(cls, assignment, actor, false);
    }

    return this.toAssignmentResponse(assignment.toObject());
  }

  // ============================================================
  // LIST (teacher / HOD)
  // ============================================================

  /** Teacher/HOD list, always scoped to the assignments their token created. */
  async listManaged(actorId: string, query: ListQuery) {
    const actor = await this.getActor(actorId);
    const page = this.parsePage(query.page);
    const limit = this.parseLimit(query.limit);

    const filter: Record<string, any> = {};

    if (actor.role !== 'admin') {
      // Like the leave module: nobody sees another user's rows. Admins keep
      // the wide view so they can still audit the whole college.
      filter.createdBy = actor._id;
    }

    if (query.classId) {
      const cls = await this.getClassLite(query.classId);
      if (!this.isClassManager(actor, cls)) {
        throw new ForbiddenException('You cannot view this class');
      }
      filter.classId = cls._id;
    }

    if (query.status) {
      if (!['published', 'closed'].includes(query.status)) {
        throw new BadRequestException('Invalid status filter');
      }
      filter.status = query.status;
    }

    const [documents, total] = await Promise.all([
      this.assignmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.assignmentModel.countDocuments(filter),
    ]);

    const counts = await this.submissionCounts(documents.map((d) => d._id));
    return {
      items: documents.map((doc) => {
        const count = counts.get(doc._id.toString());
        return this.toAssignmentResponse(doc, {
          submissionsCount: count?.submissions ?? 0,
          gradedCount: count?.graded ?? 0,
        });
      }),
      total,
      page,
      limit,
    };
  }

  // ============================================================
  // LIST (student)
  // ============================================================

  async listMine(actorId: string, query: ListQuery) {
    const actor = await this.getActor(actorId);
    if (actor.role !== 'student') {
      throw new ForbiddenException('Only students have a personal assignment list');
    }

    const page = this.parsePage(query.page);
    const limit = this.parseLimit(query.limit);

    const enrolled = await this.classModel
      .find({ classStudents: actor._id })
      .select('_id className')
      .lean<{ _id: Types.ObjectId; className: string }[]>();

    if (enrolled.length === 0) {
      return { items: [], total: 0, page, limit };
    }

    let classIds = enrolled.map((c) => c._id);
    if (query.classId) {
      const match = enrolled.find((c) => c._id.toString() === query.classId);
      if (!match) {
        throw new ForbiddenException('You are not enrolled in this class');
      }
      classIds = [match._id];
    }

    const filter: Record<string, any> = { classId: { $in: classIds } };

    const [documents, total] = await Promise.all([
      this.assignmentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.assignmentModel.countDocuments(filter),
    ]);

    const submissions = await this.submissionModel
      .find({
        student: actor._id,
        assignment: { $in: documents.map((d) => d._id) },
      })
      .lean();

    const submissionMap = new Map(
      submissions.map((s) => [s.assignment.toString(), s]),
    );

    return {
      items: documents.map((doc) => {
        const submission = submissionMap.get(doc._id.toString());
        return this.toAssignmentResponse(doc, {
          myStatus: this.deriveStudentStatus(doc, submission),
          mySubmission: submission ? this.toSubmissionResponse(submission) : null,
        });
      }),
      total,
      page,
      limit,
    };
  }

  // ============================================================
  // DETAIL
  // ============================================================

  async getDetail(actorId: string, assignmentId: string) {
    const assignment = await this.findAssignment(assignmentId);
    const cls = await this.getClassLite(assignment.classId.toString());
    const actor = await this.getActor(actorId);

    const canManage = this.canManageAssignment(actor, assignment);
    const enrolled = this.isEnrolled(actor, cls);

    if (!canManage && !enrolled) {
      throw new ForbiddenException('You cannot view this assignment');
    }

    const submission =
      actor.role === 'student'
        ? await this.submissionModel
            .findOne({ assignment: assignment._id, student: actor._id })
            .lean()
        : null;

    const extra: Record<string, any> = {
      canManage,
      myStatus: this.deriveStudentStatus(assignment, submission),
      mySubmission: submission ? this.toSubmissionResponse(submission) : null,
    };

    if (canManage) {
      const [submissionsCount, gradedCount] = await Promise.all([
        this.submissionModel.countDocuments({ assignment: assignment._id }),
        this.submissionModel.countDocuments({
          assignment: assignment._id,
          marks: { $ne: null },
        }),
      ]);
      extra.submissionsCount = submissionsCount;
      extra.gradedCount = gradedCount;
    }

    return this.toAssignmentResponse(assignment, extra);
  }

  // ============================================================
  // UPDATE
  // ============================================================

  async update(actorId: string, assignmentId: string, dto: UpdateAssignmentDto) {
    const assignment = await this.findAssignment(assignmentId);
    const actor = await this.getActor(actorId);

    await this.assertCanModify(actor, assignment);

    if (dto.classId && dto.classId !== assignment.classId.toString()) {
      throw new BadRequestException('A published assignment cannot move classes');
    }

    const update: Record<string, any> = { updatedBy: actor._id };
    const previousAttachments = [...(assignment.attachments ?? [])];

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Title cannot be empty');
      update.title = title;
    }

    if (dto.description !== undefined) {
      update.description = (dto.description ?? '').trim();
    }

    if (dto.subjectId !== undefined) update.subjectId = dto.subjectId;
    if (dto.subject !== undefined) update.subject = (dto.subject ?? '').trim() || undefined;
    if (dto.dueAt !== undefined) update.dueAt = this.parseDate(dto.dueAt);
    if (dto.allowLate !== undefined) update.allowLate = dto.allowLate;
    if (dto.status !== undefined) update.status = dto.status;

    if (dto.maxMarks !== undefined) {
      const maxMarks = this.parseMaxMarks(dto.maxMarks);
      if (maxMarks > 0) {
        const tooHigh = await this.submissionModel.exists({
          assignment: assignment._id,
          marks: { $gt: maxMarks },
        });
        if (tooHigh) {
          throw new BadRequestException(
            `Some submissions already score more than ${maxMarks}. Grade them again first.`,
          );
        }
      }
      update.maxMarks = maxMarks;
    }

    let removedAttachments: Types.ObjectId[] = [];
    if (dto.fileIds !== undefined) {
      const stored = await this.fileService.resolveOwned(actorId, dto.fileIds);
      update.attachments = stored;
      const keep = new Set(stored.map((file) => file.fileId.toString()));
      removedAttachments = previousAttachments
        .map((a) => a.fileId)
        .filter((id) => !keep.has(id.toString()));
    }

    const updated = await this.assignmentModel
      .findByIdAndUpdate(assignment._id, { $set: update }, { new: true })
      .lean();

    if (!updated) throw new NotFoundException('Assignment not found');

    await this.removeFilesIfUnreferenced(removedAttachments);

    if (dto.notify === true) {
      const cls = await this.getClassLite(updated.classId.toString());
      await this.notifyStudents(cls, updated, actor, true);
    }

    return this.toAssignmentResponse(updated);
  }

  // ============================================================
  // DELETE
  // ============================================================

  async remove(actorId: string, assignmentId: string) {
    const assignment = await this.findAssignment(assignmentId);
    const actor = await this.getActor(actorId);

    await this.assertCanModify(actor, assignment);

    const submissions = await this.submissionModel
      .find({ assignment: assignment._id })
      .lean();

    const fileIds: Types.ObjectId[] = [
      ...(assignment.attachments ?? []).map((a) => a.fileId),
      ...submissions.flatMap((s) => (s.files ?? []).map((f) => f.fileId)),
    ];

    await this.submissionModel.deleteMany({ assignment: assignment._id });
    await this.assignmentModel.deleteOne({ _id: assignment._id });
    await this.removeFilesIfUnreferenced(fileIds);

    // Remove stale bell entries so nobody taps through to a deleted assignment.
    const cls = await this.getClassLite(assignment.classId.toString());
    const recipients = (cls.classStudents ?? []).map((id) => id.toString());
    for (const userId of recipients) {
      try {
        await this.notificationService.deleteRelated(userId, {
          assignmentId: assignment._id.toString(),
        });
      } catch (error) {
        this.logger.warn(`Could not clear notifications for ${userId}: ${error}`);
      }
    }

    return { deleted: true, id: assignment._id.toString() };
  }

  // ============================================================
  // SUBMIT / RESUBMIT (student)
  // ============================================================

  async submit(actorId: string, assignmentId: string, dto: SubmitAssignmentDto) {
    const assignment = await this.findAssignment(assignmentId);
    const cls = await this.getClassLite(assignment.classId.toString());
    const actor = await this.getActor(actorId);

    if (actor.role !== 'student' || !this.isEnrolled(actor, cls)) {
      throw new ForbiddenException(
        'Only students enrolled in this class can submit',
      );
    }

    if (assignment.status === 'closed') {
      throw new BadRequestException('This assignment is closed');
    }

    const now = new Date();
    const isLate = now.getTime() > new Date(assignment.dueAt).getTime();
    if (isLate && assignment.allowLate === false) {
      throw new BadRequestException('The due date has passed');
    }

    const note = (dto.note ?? '').trim();
    const files = await this.fileService.resolveOwned(actorId, dto.fileIds ?? []);

    if (!note && files.length === 0) {
      throw new BadRequestException(
        'Write an answer or attach at least one file',
      );
    }

    const existing = await this.submissionModel
      .findOne({ assignment: assignment._id, student: actor._id })
      .lean();

    if (existing) {
      const kept = new Set(files.map((f) => f.fileId.toString()));
      const removed = (existing.files ?? [])
        .map((f) => f.fileId)
        .filter((id) => !kept.has(id.toString()));

      const update = {
        note,
        files,
        submittedAt: now,
        isLate,
        marks: null,
        feedback: '',
        gradedBy: null,
        gradedAt: null,
      };

      let submission: any;
      submission = await this.submissionModel
        .findOneAndUpdate({ _id: existing._id }, { $set: update }, { new: true })
        .lean();

      await this.removeFilesIfUnreferenced(removed);

      if (submission) {
        await this.notifyTeacher(cls, assignment, actor, submission, true);
      }

      return this.toSubmissionResponse(submission);
    }

    let submission: any;
    try {
      submission = await this.submissionModel
        .findOneAndUpdate(
          { assignment: assignment._id, student: actor._id },
          {
            $set: {
              note,
              files,
              submittedAt: now,
              isLate,
            },
            $setOnInsert: {
              marks: null,
              feedback: '',
              gradedBy: null,
              gradedAt: null,
            },
          },
          { new: true, upsert: true, setDefaultsOnInsert: true },
        )
        .lean();
    } catch (error) {
      // Two taps racing on the unique (assignment, student) index: retry as an
      // update instead of failing the request.
      if (error?.code === 11000) {
        submission = await this.submissionModel
          .findOneAndUpdate(
            { assignment: assignment._id, student: actor._id },
            {
              $set: {
                note,
                files,
                submittedAt: now,
                isLate,
                marks: null,
                feedback: '',
                gradedBy: null,
                gradedAt: null,
              },
            },
            { new: true },
          )
          .lean();
      } else {
        throw error;
      }
    }

    if (submission) {
      await this.notifyTeacher(cls, assignment, actor, submission, false);
    }

    return this.toSubmissionResponse(submission);
  }

  // ============================================================
  // SUBMISSIONS LIST (teacher / HOD)
  // ============================================================

  async listSubmissions(
    actorId: string,
    assignmentId: string,
    query: ListQuery,
  ) {
    const assignment = await this.findAssignment(assignmentId);
    const actor = await this.getActor(actorId);

    if (!this.canManageAssignment(actor, assignment)) {
      throw new ForbiddenException('You cannot view these submissions');
    }

    const page = this.parsePage(query.page);
    const limit = this.parseLimit(query.limit);

    const [documents, total, graded] = await Promise.all([
      this.submissionModel
        .find({ assignment: assignment._id })
        .sort({ submittedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.submissionModel.countDocuments({ assignment: assignment._id }),
      this.submissionModel.countDocuments({
        assignment: assignment._id,
        marks: { $ne: null },
      }),
    ]);

    const students = await this.userModel
      .find({ _id: { $in: documents.map((d) => d.student) } })
      .select('name lastName rollNo specialId image')
      .lean<{
        _id: Types.ObjectId;
        name?: string;
        lastName?: string;
        rollNo?: number;
        specialId?: string;
        image?: string;
      }[]>();

    const studentMap = new Map(students.map((s) => [s._id.toString(), s]));

    return {
      items: documents.map((doc) => {
        const student = studentMap.get(doc.student.toString());
        return {
          ...this.toSubmissionResponse(doc),
          studentName:
            [student?.name, student?.lastName].filter(Boolean).join(' ') ||
            'Student',
          rollNo: student?.rollNo ?? null,
          specialId: student?.specialId ?? null,
          image: student?.image ?? null,
        };
      }),
      total,
      graded,
      page,
      limit,
    };
  }

  // ============================================================
  // GRADE
  // ============================================================

  async grade(
    actorId: string,
    assignmentId: string,
    submissionId: string,
    dto: GradeSubmissionDto,
  ) {
    const assignment = await this.findAssignment(assignmentId);
    const cls = await this.getClassLite(assignment.classId.toString());
    const actor = await this.getActor(actorId);

    if (!this.canManageAssignment(actor, assignment)) {
      throw new ForbiddenException('You cannot grade this assignment');
    }

    if (!Types.ObjectId.isValid(submissionId)) {
      throw new BadRequestException('Invalid submission ID');
    }

    const submission = await this.submissionModel.findById(submissionId);
    if (
      !submission ||
      submission.assignment.toString() !== assignment._id.toString()
    ) {
      throw new NotFoundException('Submission not found');
    }

    const marks = Number(dto.marks);
    if (!Number.isFinite(marks) || marks < 0) {
      throw new BadRequestException('Marks must be a positive number');
    }

    if (assignment.maxMarks > 0 && marks > assignment.maxMarks) {
      throw new BadRequestException(
        `Marks cannot exceed ${assignment.maxMarks}`,
      );
    }

    submission.marks = marks;
    submission.feedback = (dto.feedback ?? '').trim();
    submission.gradedBy = actor._id;
    submission.gradedAt = new Date();
    await submission.save();

    await this.notifyStudentGraded(cls, assignment, submission, actor);

    return this.toSubmissionResponse(submission.toObject());
  }

  // ============================================================
  // FILE DOWNLOAD
  // ============================================================

  /**
   * Streams an assignment attachment, or a submission file when `submissionId`
   * is given. Teachers/HODs can read every file of their class; a student can
   * read assignment attachments and only their own submission files.
   */
  async getFile(
    actorId: string,
    assignmentId: string,
    fileId: string,
    submissionId?: string,
  ) {
    const assignment = await this.findAssignment(assignmentId);
    const cls = await this.getClassLite(assignment.classId.toString());
    const actor = await this.getActor(actorId);

    if (!Types.ObjectId.isValid(fileId)) {
      throw new NotFoundException('File not found');
    }

    const canManage = this.canManageAssignment(actor, assignment);
    let meta: { name: string; mime: string; size: number } | null = null;

    if (submissionId) {
      if (!Types.ObjectId.isValid(submissionId)) {
        throw new NotFoundException('Submission not found');
      }

      const submission = await this.submissionModel
        .findById(submissionId)
        .lean();
      if (
        !submission ||
        submission.assignment.toString() !== assignment._id.toString()
      ) {
        throw new NotFoundException('Submission not found');
      }

      if (!canManage && submission.student.toString() !== actorId) {
        throw new ForbiddenException('You cannot download this file');
      }

      const file = (submission.files ?? []).find(
        (f) => f.fileId.toString() === fileId,
      );
      if (!file) throw new NotFoundException('File not found');
      meta = { name: file.name, mime: file.mime, size: file.size };
    } else {
      if (!canManage && !this.isEnrolled(actor, cls)) {
        throw new ForbiddenException('You cannot download this file');
      }

      const file = (assignment.attachments ?? []).find(
        (f) => f.fileId.toString() === fileId,
      );
      if (!file) throw new NotFoundException('File not found');
      meta = { name: file.name, mime: file.mime, size: file.size };
    }

    const stream = await this.fileService.stream(fileId);
    return { stream, ...meta };
  }

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  private async notifyStudents(
    cls: ClassLite,
    assignment: any,
    actor: Actor,
    isUpdate: boolean,
  ) {
    const userIds = (cls.classStudents ?? [])
      .map((id) => id.toString())
      .filter((id) => Types.ObjectId.isValid(id));

    if (userIds.length === 0) return;

    const senderName = this.actorName(actor);
    const due = this.formatDue(assignment.dueAt);
    const message = isUpdate
      ? `${senderName} updated "${assignment.title}" for ${assignment.className}. Due ${due}.`
      : `${senderName} posted "${assignment.title}" for ${assignment.className}. Due ${due}.`;

    try {
      await this.notificationService.createBulk({
        userIds,
        senderId: actor._id.toString(),
        senderName,
        senderRole: actor.role,
        type: 'general',
        title: isUpdate ? 'Assignment Updated' : 'New Assignment',
        message,
        data: {
          notification_type: ASSIGNMENT_NOTIFICATION_TYPE,
          assignmentId: assignment._id.toString(),
          classId: assignment.classId.toString(),
          className: assignment.className,
          subject: assignment.subject ?? null,
        },
        classNames: [assignment.className],
      });
    } catch (error) {
      // Never fail the publish because the bell could not be rung.
      this.logger.warn(`Assignment notification failed: ${error}`);
    }
  }

  private async notifyTeacher(
    cls: ClassLite,
    assignment: any,
    student: Actor,
    submission: any,
    resubmitted: boolean,
  ) {
    const senderName = this.actorName(student);
    try {
      await this.notificationService.create({
        userId: assignment.createdBy.toString(),
        senderId: student._id.toString(),
        senderName,
        senderRole: student.role,
        type: 'general',
        title: resubmitted ? 'Assignment Resubmitted' : 'Assignment Submitted',
        message: `${senderName} ${resubmitted ? 'resubmitted' : 'submitted'} "${assignment.title}" for ${cls.className}.`,
        data: {
          notification_type: ASSIGNMENT_SUBMITTED_NOTIFICATION_TYPE,
          assignmentId: assignment._id.toString(),
          submissionId: submission._id.toString(),
          classId: assignment.classId.toString(),
          className: cls.className,
          studentId: student._id.toString(),
        },
        classNames: [cls.className],
      });
    } catch (error) {
      this.logger.warn(`Submission notification failed: ${error}`);
    }
  }

  private async notifyStudentGraded(
    cls: ClassLite,
    assignment: any,
    submission: any,
    actor: Actor,
  ) {
    const score = assignment.maxMarks
      ? `${submission.marks}/${assignment.maxMarks}`
      : `${submission.marks}`;

    try {
      await this.notificationService.create({
        userId: submission.student.toString(),
        senderId: actor._id.toString(),
        senderName: this.actorName(actor),
        senderRole: actor.role,
        type: 'general',
        title: 'Assignment Graded',
        message: `"${assignment.title}" was graded: ${score} marks.`,
        data: {
          notification_type: ASSIGNMENT_GRADED_NOTIFICATION_TYPE,
          assignmentId: assignment._id.toString(),
          submissionId: submission._id.toString(),
          classId: assignment.classId.toString(),
          className: cls.className,
          marks: submission.marks,
          maxMarks: assignment.maxMarks,
        },
        classNames: [cls.className],
      });
    } catch (error) {
      this.logger.warn(`Grade notification failed: ${error}`);
    }
  }

  // ============================================================
  // ACCESS CONTROL
  // ============================================================

  private isOwner(actor: Actor, assignment: any): boolean {
    return assignment.createdBy?.toString() === actor._id.toString();
  }

  /** Only the creator (or an admin) may manage an assignment. */
  private canManageAssignment(actor: Actor, assignment: any): boolean {
    return actor.role === 'admin' || this.isOwner(actor, assignment);
  }

  /** admin: everything. HOD: own department. Teacher: assigned classes. */
  private isClassManager(actor: Actor, cls: ClassLite): boolean {
    if (actor.role === 'admin') return true;

    if (actor.isHod === true) {
      const actorDepartment = actor.department?.toString();
      const classDepartment = cls.departmentId?.toString();
      return !!actorDepartment && actorDepartment === classDepartment;
    }

    if (actor.role === 'proff') {
      return (cls.assignes ?? []).some(
        (assigned) => assigned.teacherId?.toString() === actor._id.toString(),
      );
    }

    return false;
  }

  private async assertCanModify(actor: Actor, assignment: any) {
    if (actor.role === 'admin') return;
    if (this.isOwner(actor, assignment)) return;

    throw new ForbiddenException(
      'Only the teacher who created this assignment can change it',
    );
  }

  private isEnrolled(actor: Actor, cls: ClassLite): boolean {
    return (cls.classStudents ?? []).some(
      (id) => id.toString() === actor._id.toString(),
    );
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async getActor(actorId: string): Promise<Actor> {
    if (!Types.ObjectId.isValid(actorId)) {
      throw new UnauthorizedException('Invalid user');
    }

    const actor = await this.userModel
      .findById(actorId)
      .select('_id role isHod department name lastName')
      .lean<Actor>();

    if (!actor) throw new UnauthorizedException('Invalid user');
    return actor;
  }

  private async getClassLite(classId: string): Promise<ClassLite> {
    if (!Types.ObjectId.isValid(classId)) {
      throw new BadRequestException('Invalid class ID');
    }

    const cls = await this.classModel
      .findById(classId)
      .select('className session departmentId classStudents assignes')
      .lean<ClassLite>();

    if (!cls) throw new NotFoundException("Class doesn't exist");
    return cls;
  }

  private async findAssignment(assignmentId: string) {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new BadRequestException('Invalid assignment ID');
    }

    const assignment = await this.assignmentModel.findById(assignmentId).lean();
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  private actorName(actor: Actor): string {
    return [actor.name, actor.lastName].filter(Boolean).join(' ') || 'User';
  }

  private resolveSubjectName(
    cls: ClassLite,
    subjectId?: number,
    provided?: string,
  ): string | undefined {
    const explicit = (provided ?? '').trim();
    if (explicit) return explicit;
    if (!subjectId) return undefined;

    const match = (cls.assignes ?? []).find((a) => a.subjectId === subjectId);
    return (match?.subject ?? '').trim() || undefined;
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Due date must be a valid date');
    }
    return date;
  }

  private parseMaxMarks(value?: number): number {
    if (value === undefined || value === null) return 0;
    const marks = Number(value);
    if (!Number.isFinite(marks) || marks < 0) {
      throw new BadRequestException('Maximum marks cannot be negative');
    }
    return marks;
  }

  private parsePage(value?: string): number {
    const page = Number.parseInt(value ?? '1', 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  private parseLimit(value?: string): number {
    const limit = Number.parseInt(value ?? '50', 10);
    if (!Number.isFinite(limit) || limit <= 0) return 50;
    return Math.min(limit, 100);
  }

  private deriveStudentStatus(doc: any, submission: any): string {
    if (submission) {
      return submission.marks !== null && submission.marks !== undefined
        ? 'graded'
        : 'submitted';
    }
    if (doc.status === 'closed') return 'closed';
    if (doc.dueAt && new Date(doc.dueAt).getTime() < Date.now()) return 'overdue';
    return 'pending';
  }

  private formatDue(value: Date): string {
    try {
      return new Date(value).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return String(value);
    }
  }

  private async submissionCounts(assignmentIds: Types.ObjectId[]) {
    const map = new Map<string, { submissions: number; graded: number }>();
    if (assignmentIds.length === 0) return map;

    const rows = await this.submissionModel.aggregate([
      { $match: { assignment: { $in: assignmentIds } } },
      {
        $group: {
          _id: '$assignment',
          submissions: { $sum: 1 },
          graded: { $sum: { $cond: [{ $ne: ['$marks', null] }, 1, 0] } },
        },
      },
    ]);

    for (const row of rows) {
      map.set(row._id.toString(), {
        submissions: row.submissions ?? 0,
        graded: row.graded ?? 0,
      });
    }
    return map;
  }

  /**
   * Deletes GridFS files that no assignment or submission references any more.
   * Guards against one upload being attached in two places.
   */
  private async removeFilesIfUnreferenced(fileIds: Types.ObjectId[]) {
    if (!fileIds?.length) return;

    const unique = [
      ...new Map(fileIds.map((id) => [id.toString(), id])).values(),
    ];

    for (const id of unique) {
      const [inAssignments, inSubmissions] = await Promise.all([
        this.assignmentModel.countDocuments({ 'attachments.fileId': id }),
        this.submissionModel.countDocuments({ 'files.fileId': id }),
      ]);

      if (inAssignments === 0 && inSubmissions === 0) {
        await this.fileService.remove(id);
      }
    }
  }

  private mapFiles(files: any[] = []) {
    return files.map((file) => ({
      fileId: file.fileId.toString(),
      name: file.name,
      mime: file.mime,
      size: file.size,
    }));
  }

  private toAssignmentResponse(doc: any, extra: Record<string, any> = {}) {
    return {
      id: doc._id.toString(),
      classId: doc.classId?.toString?.() ?? doc.classId,
      className: doc.className,
      departmentId: doc.departmentId?.toString?.() ?? null,
      subjectId: doc.subjectId ?? null,
      subject: doc.subject ?? null,
      title: doc.title,
      description: doc.description ?? '',
      attachments: this.mapFiles(doc.attachments ?? []),
      dueAt: doc.dueAt,
      maxMarks: doc.maxMarks ?? 0,
      allowLate: doc.allowLate !== false,
      status: doc.status ?? 'published',
      createdBy: doc.createdBy?.toString?.() ?? null,
      createdByName: doc.createdByName ?? '',
      createdAt: doc.createdAt ?? null,
      updatedAt: doc.updatedAt ?? null,
      ...extra,
    };
  }

  private toSubmissionResponse(submission: any) {
    if (!submission) return null;

    return {
      id: submission._id.toString(),
      assignmentId: submission.assignment.toString(),
      studentId: submission.student.toString(),
      note: submission.note ?? '',
      files: this.mapFiles(submission.files ?? []),
      submittedAt: submission.submittedAt,
      isLate: submission.isLate === true,
      marks:
        submission.marks === null || submission.marks === undefined
          ? null
          : submission.marks,
      feedback: submission.feedback ?? '',
      gradedBy: submission.gradedBy?.toString?.() ?? null,
      gradedAt: submission.gradedAt ?? null,
    };
  }
}
