import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitPersonalityTestDto } from './dto/submit-personality-test.dto';
import { MAX_LIKERT_SCORE, MIN_LIKERT_SCORE, PERSONALITY_TEST_ITEMS } from './personality-test.constants';

export interface PersonalityTestItemView {
  id: string;
  dimension: string;
  statement: string;
}

export interface PersonalityProfileView {
  dimensionScores: Record<string, number>;
  completedAt: string;
}

export interface PersonalityCompatibilityResult {
  percentage: number | null;
  sharedDimensionCount: number;
}

@Injectable()
export class PersonalityTestService {
  constructor(private readonly prisma: PrismaService) {}

  getItems(): PersonalityTestItemView[] {
    return PERSONALITY_TEST_ITEMS.map(({ id, dimension, statement }) => ({ id, dimension, statement }));
  }

  async submitTest(userId: string, dto: SubmitPersonalityTestDto): Promise<PersonalityProfileView> {
    const itemsById = new Map(PERSONALITY_TEST_ITEMS.map((item) => [item.id, item]));

    const seenItemIds = new Set<string>();
    for (const response of dto.responses) {
      if (!itemsById.has(response.itemId)) {
        throw new BadRequestException(`Unknown test item: ${response.itemId}`);
      }
      if (seenItemIds.has(response.itemId)) {
        throw new BadRequestException(`Duplicate response for item: ${response.itemId}`);
      }
      seenItemIds.add(response.itemId);
    }
    if (seenItemIds.size !== PERSONALITY_TEST_ITEMS.length) {
      throw new BadRequestException('The test must be answered in full.');
    }

    const dimensionScores: Record<string, number> = {};
    for (const response of dto.responses) {
      const item = itemsById.get(response.itemId)!;
      const adjustedScore = item.reverseScored
        ? MAX_LIKERT_SCORE + MIN_LIKERT_SCORE - response.score
        : response.score;
      dimensionScores[item.dimension] = adjustedScore * 20;
    }

    const profile = await this.prisma.personalityProfile.upsert({
      where: { userId },
      create: { userId, dimensionScores },
      update: { dimensionScores, completedAt: new Date() },
    });

    return this.toView(profile);
  }

  async getMyProfile(userId: string): Promise<PersonalityProfileView> {
    const profile = await this.prisma.personalityProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("You haven't completed the personality test yet.");
    }
    return this.toView(profile);
  }

  async getCompatibility(
    userId: string,
    otherUserId: string,
  ): Promise<PersonalityCompatibilityResult> {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot calculate compatibility with yourself.');
    }

    const [mine, theirs] = await Promise.all([
      this.prisma.personalityProfile.findUnique({ where: { userId } }),
      this.prisma.personalityProfile.findUnique({ where: { userId: otherUserId } }),
    ]);

    if (!mine || !theirs) {
      return { percentage: null, sharedDimensionCount: 0 };
    }

    const myScores = mine.dimensionScores as Record<string, number>;
    const theirScores = theirs.dimensionScores as Record<string, number>;

    const sharedDimensions = Object.keys(myScores).filter((dimension) => dimension in theirScores);
    if (sharedDimensions.length === 0) {
      return { percentage: null, sharedDimensionCount: 0 };
    }

    const totalSimilarity = sharedDimensions.reduce((sum, dimension) => {
      const diff = Math.abs(myScores[dimension] - theirScores[dimension]);
      return sum + (100 - diff);
    }, 0);

    return {
      percentage: Math.round(totalSimilarity / sharedDimensions.length),
      sharedDimensionCount: sharedDimensions.length,
    };
  }

  private toView(profile: { dimensionScores: unknown; completedAt: Date }): PersonalityProfileView {
    return {
      dimensionScores: profile.dimensionScores as Record<string, number>,
      completedAt: profile.completedAt.toISOString(),
    };
  }
}
