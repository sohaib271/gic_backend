import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Survey, SurveyDocument } from './schema/survey.schema';
import {
  SurveyResponse,
  SurveyResponseDocument,
} from './schema/survey-response.schema';
import { SaveSurveyDto, SubmitSurveyDto } from './dto/survey.dto';
import { User, UserDocument } from 'src/user/schema/user.schema';
import { Class, ClassDocument } from 'src/class/schema/class.schema';

@Injectable()
export class SurveyService {
  constructor(
    @InjectModel(Survey.name) private surveyModel: Model<SurveyDocument>,
    @InjectModel(SurveyResponse.name)
    private responseModel: Model<SurveyResponseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Class.name) private classModel: Model<ClassDocument>,
  ) {}

  /**
   * Resolve the class name(s) a student belongs to. Students can have a
   * `className` on their user doc, but in the real data they are usually
   * linked through the classes collection (`classStudents` array).
   */
  async resolveStudentClassNames(student: any): Promise<string[]> {
    const direct = (student?.className ?? '').toString().trim();
    if (direct) return [direct];

    const classes = await this.classModel
      .find({ classStudents: (student?._id ?? student?.id) as any })
      .select('className')
      .lean();
    return classes
      .map((c: any) => c.className)
      .filter((name) => typeof name === 'string' && name.trim());
  }

  async getSurveys() {
    const surveys = await this.surveyModel
      .find()
      .sort({ createdAt: -1 })
      .populate({ path: 'createdBy', select: 'name lastName role' })
      .lean();

    const ids = surveys.map((s) => s._id);
    const counts = await this.responseModel.aggregate([
      { $match: { survey: { $in: ids } } },
      { $group: { _id: '$survey', responses: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c: any) => [c._id.toString(), c.responses]));

    const list = surveys.map((s: any) => ({
      ...s,
      responseCount: countMap.get(s._id.toString()) ?? 0,
    }));

    return { count: list.length, surveys: list };
  }

  async createSurvey(dto: SaveSurveyDto, createdBy: string, creatorRole: string) {
    this.validateQuestions(dto.questions);
    if (!Array.isArray(dto.classNames) || dto.classNames.length === 0) {
      throw new BadRequestException('Select at least one class');
    }
    if (!Types.ObjectId.isValid(createdBy)) {
      throw new BadRequestException('Invalid creator ID');
    }

    const survey = await this.surveyModel.create({
      title: dto.title.trim(),
      description: dto.description?.trim() || '',
      questions: dto.questions as any,
      classNames: dto.classNames,
      category: (dto.category || null) as any,
      status: (dto.status || 'active') as any,
      creatorRole,
      createdBy: new Types.ObjectId(createdBy),
    });

    return { message: 'Survey created', survey };
  }

  async updateSurvey(id: string, dto: SaveSurveyDto) {
    this.validateObjectId(id, 'Invalid survey ID');
    this.validateQuestions(dto.questions);
    if (!Array.isArray(dto.classNames) || dto.classNames.length === 0) {
      throw new BadRequestException('Select at least one class');
    }

    const survey = await this.surveyModel
      .findByIdAndUpdate(
        id,
        {
          title: dto.title.trim(),
          description: dto.description?.trim() || '',
          questions: dto.questions as any,
          classNames: dto.classNames,
          category: (dto.category || null) as any,
        },
        { new: true },
      )
      .lean();
    if (!survey) throw new NotFoundException('Survey not found');

    return { message: 'Survey updated', survey };
  }

  async setStatus(id: string, status: 'active' | 'inactive') {
    this.validateObjectId(id, 'Invalid survey ID');
    const survey = await this.surveyModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .lean();
    if (!survey) throw new NotFoundException('Survey not found');
    return { message: `Survey ${status === 'active' ? 'activated' : 'deactivated'}`, survey };
  }

  async deleteSurvey(id: string) {
    this.validateObjectId(id, 'Invalid survey ID');
    const survey = await this.surveyModel.findByIdAndDelete(id).lean();
    if (!survey) throw new NotFoundException('Survey not found');
    await this.responseModel.deleteMany({ survey: new Types.ObjectId(id) });
    return { message: 'Survey deleted' };
  }

  async getSurveyDetail(id: string) {
    this.validateObjectId(id, 'Invalid survey ID');

    const survey = await this.surveyModel
      .findById(id)
      .populate({ path: 'createdBy', select: 'name lastName role' })
      .lean();
    if (!survey) throw new NotFoundException('Survey not found');

    const responses = await this.responseModel
      .find({ survey: new Types.ObjectId(id) })
      .populate({ path: 'student', select: 'name lastName specialId email' })
      .lean();

    // Number of target students (students of the chosen classes)
    const classes = await this.classModel
      .find({ className: { $in: survey.classNames } })
      .select('classStudents')
      .lean();
    const classStudentIds = classes.reduce<Set<string>>((acc, c: any) => {
      for (const id of c.classStudents ?? []) acc.add(id.toString());
      return acc;
    }, new Set());
    const targetIds = [...classStudentIds];
    const targetCount =
      targetIds.length > 0
        ? await this.userModel.countDocuments({
            role: 'student',
            _id: { $in: targetIds },
            $or: [{ struckOff: { $ne: true } }, { struckOff: { $exists: false } }],
          })
        : await this.userModel.countDocuments({
            role: 'student',
            className: { $in: survey.classNames },
          });

    const stats = this.computeStats(survey as any, responses);

    return {
      survey,
      targetStudents: targetCount,
      responseCount: responses.length,
      stats,
      responses: responses.map((r: any) => ({
        _id: r._id,
        student: r.student,
        answers: r.answers,
        submittedAt: r.createdAt,
      })),
    };
  }

  async getSurveyResponses(id: string, page = 1, limit = 20) {
    this.validateObjectId(id, 'Invalid survey ID');
    const filter = { survey: new Types.ObjectId(id) };
    const [responses, total] = await Promise.all([
      this.responseModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate({ path: 'student', select: 'name lastName specialId email' })
        .lean(),
      this.responseModel.countDocuments(filter),
    ]);
    return {
      responses,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAvailableSurveys(studentId: string) {
    const student = await this.userModel.findById(studentId).lean();
    if (!student || student.role !== 'student') {
      return { count: 0, surveys: [] };
    }

    const studentClassNames = await this.resolveStudentClassNames(student);

    const surveys = await this.surveyModel
      .find({ status: 'active' as any })
      .sort({ createdAt: -1 })
      .lean();

    const answeredRecords = await this.responseModel
      .find({ student: new Types.ObjectId(studentId) })
      .select('survey submittedAt')
      .lean();
    const answeredMap = new Map(
      answeredRecords.map((r: any) => [
        (r.survey as any).toString(),
        { answered: true, submittedAt: r.submittedAt ?? r.createdAt },
      ]),
    );

    const available = surveys
      .filter(
        (s) => s.classNames.some((cn) => studentClassNames.includes(cn)),
      )
      .map((s: any) => ({
        _id: s._id,
        title: s.title,
        description: s.description,
        questionCount: s.questions.length,
        category: s.category,
        createdAt: s.createdAt,
        ...(answeredMap.get(s._id.toString()) ?? { answered: false }),
      }));

    return { count: available.length, surveys: available };
  }

  async getSurveyForTake(id: string, studentId: string) {
    this.validateObjectId(id, 'Invalid survey ID');

    const student = await this.userModel.findById(studentId).lean();
    if (!student || student.role !== 'student') {
      throw new BadRequestException('Only students can take surveys');
    }

    const studentClassNames = await this.resolveStudentClassNames(student);

    const survey = await this.surveyModel.findById(id).lean();
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'active') {
      throw new BadRequestException('This survey is not available');
    }
    if (!survey.classNames.some((cn) => studentClassNames.includes(cn))) {
      throw new BadRequestException('This survey is not available for your class');
    }

    const existing = await this.responseModel
      .findOne({ survey: new Types.ObjectId(id), student: new Types.ObjectId(studentId) })
      .lean();

    return {
      survey: {
        _id: survey._id,
        title: (survey as any).title,
        description: (survey as any).description,
        questions: (survey as any).questions,
        category: (survey as any).category,
        createdAt: (survey as any).createdAt,
      },
      previousAnswers: (existing as any)?.answers ?? null,
      submittedAt: (existing as any)?.createdAt ?? null,
    };
  }

  async submitSurvey(id: string, studentId: string, dto: SubmitSurveyDto) {
    this.validateObjectId(id, 'Invalid survey ID');

    const student = await this.userModel.findById(studentId).lean();
    if (!student || student.role !== 'student') {
      throw new BadRequestException('Only students can submit surveys');
    }

    const survey = await this.surveyModel.findById(id).lean();
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'active') {
      throw new BadRequestException('This survey is not active');
    }
    const studentClassNames = await this.resolveStudentClassNames(student);
    if (!survey.classNames.some((cn) => studentClassNames.includes(cn))) {
      throw new BadRequestException('This survey is not available for your class');
    }

    const questions: any[] = (survey as any).questions || [];
    if (!Array.isArray(dto.answers) || dto.answers.length === 0) {
      throw new BadRequestException('Answers are required');
    }

    const answers = dto.answers.map((a) => {
      const q = questions[a.questionIndex];
      if (!q) throw new BadRequestException('Invalid question reference');
      let value: string | string[];
      if (q.type === 'text') {
        value = String(a.answer ?? '').trim();
        if (q.required && !value) {
          throw new BadRequestException(`"${q.question}" is required`);
        }
      } else {
        const selected = Array.isArray(a.answer) ? a.answer : [a.answer];
        const clean = selected
          .filter((v) => q.options.includes(String(v)))
          .map((v) => String(v));
        if (q.type === 'single') {
          if (clean.length > 1) {
            throw new BadRequestException(`Select one option for "${q.question}"`);
          }
          if (clean.length === 0 && q.required) {
            throw new BadRequestException(`"${q.question}" is required`);
          }
        } else if (q.required && clean.length === 0) {
          throw new BadRequestException(`"${q.question}" is required`);
        }
        value = clean;
      }
      return {
        questionIndex: a.questionIndex,
        question: q.question,
        type: q.type,
        answer: value,
      };
    });

    const existing = await this.responseModel.findOne({
      survey: survey._id,
      student: new Types.ObjectId(studentId),
    });

    let saved;
    if (existing) {
      existing.answers = answers as any;
      saved = await existing.save();
    } else {
      saved = await this.responseModel.create({
        survey: survey._id,
        student: new Types.ObjectId(studentId),
        answers,
      });
    }

    return {
      message: existing ? 'Survey response updated' : 'Survey submitted',
      surveyId: id,
      submitted: true,
    };
  }

  private computeStats(survey: Survey, responses: any[]) {
    const questions = (survey.questions || []) as any[];
    return questions.map((q, qi) => {
      const base = { questionIndex: qi, question: q.question, type: q.type };
      if (q.type === 'text') {
        return {
          ...base,
          textAnswers: responses
            .map((r) => {
              const a = (r.answers || []).find(
                (x: any) => x.questionIndex === qi,
              );
              return a ? a.answer : null;
            })
            .filter((v) => v !== null && String(v).trim() !== ''),
        };
      }
      const tally: Record<string, number> = {};
      for (const opt of q.options || []) tally[opt] = 0;
      let answered = 0;
      for (const r of responses) {
        const a = (r.answers || []).find((x: any) => x.questionIndex === qi);
        if (!a) continue;
        const selected = Array.isArray(a.answer) ? a.answer : [a.answer];
        for (const v of selected) {
          if (v in tally) tally[v]++;
        }
        answered++;
      }
      return {
        ...base,
        options: q.options || [],
        tally,
        answered,
      };
    });
  }

  private validateQuestions(questions: any[]) {
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new BadRequestException('Add at least one question');
    }
    for (const q of questions) {
      if (!q.question || !String(q.question).trim()) {
        throw new BadRequestException('Question text is required');
      }
      if (!['text', 'single', 'multiple'].includes(q.type)) {
        throw new BadRequestException(
          `Invalid question type "${q.type}" for "${q.question}"`,
        );
      }
      if (q.type !== 'text') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          throw new BadRequestException(
            `Add at least 2 options for "${q.question}"`,
          );
        }
        const seen = new Set<string>();
        for (const opt of q.options) {
          const o = String(opt).trim();
          if (!o) {
            throw new BadRequestException(
              `Option text cannot be empty in "${q.question}"`,
            );
          }
          if (seen.has(o)) {
            throw new BadRequestException(
              `Duplicate option "${o}" in "${q.question}"`,
            );
          }
          seen.add(o);
        }
      }
    }
  }

  private validateObjectId(id: string, message: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(message);
    }
  }
}