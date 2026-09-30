import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subject, SubjectDocument } from './schema/subject.schema';
import { Class, ClassDocument } from 'src/class/schema/class.schema';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';

@Injectable()
export class SubjectService {
  constructor(
    @InjectModel(Subject.name) private readonly subjectModel: Model<SubjectDocument>,
    @InjectModel(Class.name) private readonly classModel: Model<ClassDocument>,
  ) {}

  private async nextSubjectId(): Promise<number> {
    const last = await this.subjectModel
      .findOne({}, { subjectId: 1 })
      .sort({ subjectId: -1 })
      .lean();

    return (last?.subjectId ?? 0) + 1;
  }

  async create(dto: CreateSubjectDto) {
    const duplicate = await this.subjectModel.exists({
      name: dto.name,
      ...(dto.department ? { department: dto.department } : {}),
    });
    if (duplicate) {
      throw new ConflictException('Subject already exists in this department');
    }

    // An explicit id is honoured so seeding can control the numbering, but a
    // collision is rejected rather than silently renumbering.
    let subjectId: number;
    if (dto.subjectId) {
      const taken = await this.subjectModel.exists({ subjectId: dto.subjectId });
      if (taken) {
        throw new ConflictException(`subjectId ${dto.subjectId} is already in use`);
      }
      subjectId = dto.subjectId;
    } else {
      subjectId = await this.nextSubjectId();
    }

    const subject = await this.subjectModel.create({
      subjectId,
      name: dto.name,
      code: dto.code,
      department: dto.department,
      category: dto.category,
      isActive: dto.isActive ?? true,
    });

    return { message: 'Subject created successfully', subject };
  }

  async getAll(department?: string, category?: string) {
    const filter: Record<string, unknown> = {};
    if (department) filter.department = department;
    if (category) filter.category = category;

    return this.subjectModel
      .find(filter)
      .sort({ subjectId: 1 })
      .populate('department', 'name code')
      .lean();
  }

  async getBySubjectId(subjectId: number) {
    const subject = await this.subjectModel
      .findOne({ subjectId })
      .populate('department', 'name code')
      .lean();

    if (!subject) {
      throw new NotFoundException(`Subject with subjectId ${subjectId} not found`);
    }
    return subject;
  }

  /**
   * Bulk resolve used by class/teacher/attendance responses so the mobile app
   * gets subject names alongside the numeric ids.
   */
  async getBySubjectIds(subjectIds: number[]) {
    const unique = [...new Set(subjectIds.filter((id) => Number.isFinite(id)))];
    if (unique.length === 0) return [];

    const subjects = await this.subjectModel
      .find({ subjectId: { $in: unique } })
      .sort({ subjectId: 1 })
      .lean();

    const byId = new Map(subjects.map((s) => [s.subjectId, s]));
    return unique.map((id) => ({
      subjectId: id,
      name: byId.get(id)?.name ?? null,
      code: byId.get(id)?.code ?? null,
    }));
  }

  async getMapBySubjectIds(subjectIds: number[]) {
    const resolved = await this.getBySubjectIds(subjectIds);
    return new Map(resolved.map((s) => [s.subjectId, s]));
  }

  /**
   * The admin portal (and any other client predating the Subject module) sends
   * the subject as a free-text name, not a numeric id. Resolve those names to
   * ids so schedules created through that path still get subject-wise
   * reporting.
   *
   * Matching is: exact (case/space insensitive) → alias → unique prefix.
   * Returns a name→id map; names that resolve to nothing are simply absent, and
   * the caller decides whether to warn or fail.
   */
  async resolveSubjectIdsByNames(names: string[]) {
    const cleaned = [
      ...new Set(
        names
          .map((n) => (typeof n === 'string' ? n.trim() : ''))
          .filter((n) => n.length > 0),
      ),
    ];
    if (cleaned.length === 0) return new Map<string, number>();

    const subjects = await this.subjectModel.find().lean();

    const exact = new Map<string, number>();
    const byCode = new Map<string, number>();
    const byAlias = new Map<string, number>();

    for (const subject of subjects) {
      const name = subject.name?.trim();
      if (!name) continue;

      const key = this.normalizeSubjectName(name);
      // First definition wins so a duplicated name cannot flip between ids.
      if (!exact.has(key)) exact.set(key, subject.subjectId);

      const code = subject.code?.trim();
      if (code && !byCode.has(code.toUpperCase())) {
        byCode.set(code.toUpperCase(), subject.subjectId);
      }

      for (const alias of this.subjectAliases(name)) {
        if (!byAlias.has(alias)) byAlias.set(alias, subject.subjectId);
      }
    }

    const resolved = new Map<string, number>();

    for (const name of cleaned) {
      const key = this.normalizeSubjectName(name);
      const hit =
        exact.get(key) ??
        byCode.get(name.trim().toUpperCase()) ??
        byAlias.get(key);

      if (hit !== undefined) {
        resolved.set(name, hit);
        continue;
      }

      // Last resort: a unique prefix, so "Computer" still finds
      // "Computer Science". Ambiguous prefixes are left unresolved on purpose.
      const matches = [...exact.entries()].filter(([candidate]) =>
        candidate.startsWith(key),
      );
      if (matches.length === 1) resolved.set(name, matches[0][1]);
    }

    return resolved;
  }

  private normalizeSubjectName(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private subjectAliases(name: string): string[] {
    const key = this.normalizeSubjectName(name);
    // Canonical name → the spellings that should also resolve to it. Keyed by
    // the *stored* subject, so a lookup table from alias→canonical would never
    // fire in the direction needed here.
    const catalog: Record<string, string[]> = {
      mathematics: ['math', 'maths', 'general math', 'mathematics'],
      physics: ['physics', 'phy'],
      chemistry: ['chemistry', 'chem'],
      biology: ['biology', 'bio'],
      english: ['english', 'eng'],
      urdu: ['urdu', 'urd'],
      islamiyat: ['islamiyat', 'islamic studies', 'isl'],
      'pakistan studies': [
        'pakistan studies',
        'pakistan study',
        'pak studies',
      ],
      economics: ['economics', 'econ'],
      'computer science': [
        'computer science',
        'computer studies',
        'computer',
        'software engineering',
        'cs',
      ],
    };

    const aliases = new Set<string>(catalog[key] ?? [key]);

    // "Subject Maths" / "Subjects maths" also collapse to the bare alias.
    const bare = key.replace(/\bsubjects?\b/g, '').trim();
    if (bare && bare !== key) {
      aliases.add(bare);
      aliases.add(bare.replace(/s$/, ''));
    }

    return [...aliases];
  }

  async update(subjectId: number, dto: UpdateSubjectDto) {
    const subject = await this.subjectModel.findOne({ subjectId });
    if (!subject) {
      throw new NotFoundException(`Subject with subjectId ${subjectId} not found`);
    }

    if (dto.name && dto.name !== subject.name) {
      const duplicate = await this.subjectModel.exists({
        _id: { $ne: subject._id },
        name: dto.name,
        department: dto.department ?? subject.department,
      });
      if (duplicate) {
        throw new ConflictException('Subject already exists in this department');
      }
    }

    if (dto.name !== undefined) subject.name = dto.name;
    if (dto.code !== undefined) subject.code = dto.code;
    if (dto.department !== undefined) subject.department = dto.department as never;
    if (dto.category !== undefined) subject.category = dto.category;
    if (dto.isActive !== undefined) subject.isActive = dto.isActive;

    await subject.save();
    return { message: 'Subject updated successfully', subject };
  }

  async remove(subjectId: number) {
    const subject = await this.subjectModel.findOne({ subjectId });
    if (!subject) {
      throw new NotFoundException(`Subject with subjectId ${subjectId} not found`);
    }

    // subjectId is referenced from class schedules, so deleting while it is
    // still in use would leave those lectures pointing at nothing.
    const inUse = await this.classModel.exists({
      $or: [
        { 'assignes.subjectId': subjectId },
        { 'assignes.schedule.subjectId': subjectId },
      ],
    });
    if (inUse) {
      throw new BadRequestException(
        `Subject ${subjectId} is used in a class schedule. Remove it from the schedule first.`,
      );
    }

    await subject.deleteOne();
    return { message: 'Subject deleted successfully' };
  }
}
