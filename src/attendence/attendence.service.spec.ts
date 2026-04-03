import { Test, TestingModule } from '@nestjs/testing';
import { AttendenceService } from './attendence.service';

describe('AttendenceService', () => {
  let service: AttendenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AttendenceService],
    }).compile();

    service = module.get<AttendenceService>(AttendenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
