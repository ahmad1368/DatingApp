import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitPersonalityTestDto } from './dto/submit-personality-test.dto';
import {
  categoryForDimension,
  MAX_LIKERT_SCORE,
  MIN_LIKERT_SCORE,
  PERSONALITY_TEST_ITEMS,
} from './personality-test.constants';

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

export interface DimensionComparison {
  dimension: string;
  myScore: number;
  theirScore: number;
  similarity: number;
}

export interface CategoryBreakdown {
  category: string;
  averageSimilarity: number;
  dimensions: DimensionComparison[];
}

export interface PersonalityCompatibilityBreakdown {
  percentage: number | null;
  sharedDimensionCount: number;
  categories: CategoryBreakdown[];
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
    const shared = await this.fetchSharedDimensions(userId, otherUserId);
    if (!shared) {
      return { percentage: null, sharedDimensionCount: 0 };
    }

    return {
      percentage: this.averageSimilarity(shared.comparisons),
      sharedDimensionCount: shared.comparisons.length,
    };
  }

  /**
   * Same underlying similarity math as getCompatibility, but grouped by
   * category (emotional values, core values, communication style, social
   * habits) so the client can render a side-by-side breakdown rather than
   * just a single aggregate percentage.
   */
  async getCompatibilityBreakdown(
    userId: string,
    otherUserId: string,
  ): Promise<PersonalityCompatibilityBreakdown> {
    const shared = await this.fetchSharedDimensions(userId, otherUserId);
    if (!shared) {
      return { percentage: null, sharedDimensionCount: 0, categories: [] };
    }

    const dimensionsByCategory = new Map<string, DimensionComparison[]>();
    for (const comparison of shared.comparisons) {
      const category = categoryForDimension(comparison.dimension);
      const existing = dimensionsByCategory.get(category) ?? [];
      existing.push(comparison);
      dimensionsByCategory.set(category, existing);
    }

    const categories: CategoryBreakdown[] = [...dimensionsByCategory.entries()].map(
      ([category, dimensions]) => ({
        category,
        averageSimilarity: this.averageSimilarity(dimensions),
        dimensions,
      }),
    );

    return {
      percentage: this.averageSimilarity(shared.comparisons),
      sharedDimensionCount: shared.comparisons.length,
      categories,
    };
  }

  private async fetchSharedDimensions(
    userId: string,
    otherUserId: string,
  ): Promise<{ comparisons: DimensionComparison[] } | null> {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot calculate compatibility with yourself.');
    }

    const [mine, theirs] = await Promise.all([
      this.prisma.personalityProfile.findUnique({ where: { userId } }),
      this.prisma.personalityProfile.findUnique({ where: { userId: otherUserId } }),
    ]);

    if (!mine || !theirs) {
      return null;
    }

    const myScores = mine.dimensionScores as Record<string, number>;
    const theirScores = theirs.dimensionScores as Record<string, number>;

    const sharedDimensions = Object.keys(myScores).filter((dimension) => dimension in theirScores);
    if (sharedDimensions.length === 0) {
      return null;
    }

    const comparisons = sharedDimensions.map((dimension) => {
      const myScore = myScores[dimension];
      const theirScore = theirScores[dimension];
      return {
        dimension,
        myScore,
        theirScore,
        similarity: 100 - Math.abs(myScore - theirScore),
      };
    });

    return { comparisons };
  }

  private averageSimilarity(comparisons: DimensionComparison[]): number {
    const total = comparisons.reduce((sum, comparison) => sum + comparison.similarity, 0);
    return Math.round(total / comparisons.length);
  }

  private toView(profile: { dimensionScores: unknown; completedAt: Date }): PersonalityProfileView {
    return {
      dimensionScores: profile.dimensionScores as Record<string, number>,
      completedAt: profile.completedAt.toISOString(),
    };
  }
}
