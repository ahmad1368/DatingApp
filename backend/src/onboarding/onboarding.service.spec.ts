import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { OnboardingService } from './onboarding.service';

const USER_ID = 'user-1';

function isoDateYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: { user: { update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { update: jest.fn() } };
    service = new OnboardingService(prisma as unknown as PrismaService);
  });

  it('rejects users under the minimum age', async () => {
    const dto: CompleteOnboardingDto = {
      dateOfBirth: isoDateYearsAgo(16),
      relationshipGoal: 'LONG_TERM',
      interests: ['Hiking'],
    };

    await expect(service.completeOnboarding(USER_ID, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('saves onboarding data and marks it complete for an eligible user', async () => {
    const dto: CompleteOnboardingDto = {
      name: 'Jane',
      dateOfBirth: isoDateYearsAgo(25),
      relationshipGoal: 'CASUAL',
      interests: ['Hiking', 'Music'],
    };
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      name: 'Jane',
      dateOfBirth: new Date(dto.dateOfBirth),
      relationshipGoal: 'CASUAL',
      interests: ['Hiking', 'Music'],
      onboardingCompletedAt: new Date(),
    });

    const result = await service.completeOnboarding(USER_ID, dto);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        name: 'Jane',
        dateOfBirth: new Date(dto.dateOfBirth),
        relationshipGoal: 'CASUAL',
        interests: ['Hiking', 'Music'],
        onboardingCompletedAt: expect.any(Date),
      },
    });
    expect(result.relationshipGoal).toBe('CASUAL');
    expect(result.interests).toEqual(['Hiking', 'Music']);
  });

  it('leaves the existing name untouched when none is provided', async () => {
    const dto: CompleteOnboardingDto = {
      dateOfBirth: isoDateYearsAgo(30),
      relationshipGoal: 'FRIENDSHIP',
      interests: ['Travel'],
    };
    prisma.user.update.mockResolvedValue({
      id: USER_ID,
      name: 'Existing Name',
      dateOfBirth: new Date(dto.dateOfBirth),
      relationshipGoal: 'FRIENDSHIP',
      interests: ['Travel'],
      onboardingCompletedAt: new Date(),
    });

    await service.completeOnboarding(USER_ID, dto);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: {
        dateOfBirth: new Date(dto.dateOfBirth),
        relationshipGoal: 'FRIENDSHIP',
        interests: ['Travel'],
        onboardingCompletedAt: expect.any(Date),
      },
    });
  });
});
