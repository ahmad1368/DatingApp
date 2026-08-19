import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { MINIMUM_AGE_YEARS } from './onboarding.constants';

export interface CompleteOnboardingResult {
  id: string;
  name: string | null;
  dateOfBirth: string;
  relationshipGoal: string;
  interests: string[];
  onboardingCompletedAt: string;
}

function calculateAge(dateOfBirth: Date, now: Date): number {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async completeOnboarding(
    userId: string,
    dto: CompleteOnboardingDto,
  ): Promise<CompleteOnboardingResult> {
    const dateOfBirth = new Date(dto.dateOfBirth);
    const age = calculateAge(dateOfBirth, new Date());

    if (age < MINIMUM_AGE_YEARS) {
      throw new BadRequestException(`You must be at least ${MINIMUM_AGE_YEARS} years old to use this app.`);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        dateOfBirth,
        relationshipGoal: dto.relationshipGoal,
        interests: dto.interests,
        onboardingCompletedAt: new Date(),
      },
    });

    return {
      id: user.id,
      name: user.name,
      dateOfBirth: user.dateOfBirth!.toISOString(),
      relationshipGoal: user.relationshipGoal!,
      interests: user.interests,
      onboardingCompletedAt: user.onboardingCompletedAt!.toISOString(),
    };
  }
}
