import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitPersonalityTestDto } from './dto/submit-personality-test.dto';
import {
  categoryForDimension,
  DEFAULT_CATEGORY_WEIGHT,
  MAX_CATEGORY_WEIGHT,
  MAX_LIKERT_SCORE,
  MIN_CATEGORY_WEIGHT,
  MIN_LIKERT_SCORE,
  PERSONALITY_CATEGORIES,
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

export interface CompatibilityReportSection {
  title: string;
  score: number;
  insight: string;
  dimensions: DimensionComparison[];
}

export interface CompatibilityReport {
  percentage: number | null;
  sharedDimensionCount: number;
  sections: CompatibilityReportSection[];
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

    const weights = await this.getCategoryWeights(userId);
    return {
      percentage: this.weightedAverageSimilarity(shared.comparisons, weights),
      sharedDimensionCount: shared.comparisons.length,
    };
  }

  /**
   * "Compatibility score weighting customizer": lets a user turn up how
   * much a PERSONALITY_CATEGORIES group counts toward their own view of
   * compatibility with someone else (e.g. Core Values over Social Habits),
   * without changing the per-category breakdown itself - only the blended
   * top-level percentage in getCompatibility/getCompatibilityBreakdown.
   */
  async getCategoryWeights(userId: string): Promise<Record<string, number>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { compatibilityCategoryWeights: true },
    });
    return this.normalizeWeights(user?.compatibilityCategoryWeights as Record<string, number> | null);
  }

  async setCategoryWeights(
    userId: string,
    weights: Record<string, number>,
  ): Promise<Record<string, number>> {
    for (const [category, weight] of Object.entries(weights)) {
      if (!PERSONALITY_CATEGORIES.includes(category)) {
        throw new BadRequestException(`Unknown compatibility category: ${category}`);
      }
      if (typeof weight !== 'number' || weight < MIN_CATEGORY_WEIGHT || weight > MAX_CATEGORY_WEIGHT) {
        throw new BadRequestException(
          `Weight for ${category} must be between ${MIN_CATEGORY_WEIGHT} and ${MAX_CATEGORY_WEIGHT}.`,
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { compatibilityCategoryWeights: weights },
    });

    return this.normalizeWeights(user.compatibilityCategoryWeights as Record<string, number> | null);
  }

  private normalizeWeights(stored: Record<string, number> | null | undefined): Record<string, number> {
    const result: Record<string, number> = {};
    for (const category of PERSONALITY_CATEGORIES) {
      result[category] = stored?.[category] ?? DEFAULT_CATEGORY_WEIGHT;
    }
    return result;
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

    const weights = await this.getCategoryWeights(userId);
    return {
      percentage: this.weightedAverageSimilarity(shared.comparisons, weights),
      sharedDimensionCount: shared.comparisons.length,
      categories,
    };
  }

  /**
   * The "diagnostic report" view: unlike getCompatibilityBreakdown (every
   * category, purely numeric), this spotlights the three areas the issue
   * that requested it called out - communication strengths, conflict
   * resolution style (a single dimension inside Communication Style, pulled
   * out for its own section since it drives so much relationship friction),
   * and emotional compatibility - each with a plain-language insight
   * derived from its score tier, and skips a section entirely if the pair
   * has no shared dimensions there.
   */
  async getCompatibilityReport(userId: string, otherUserId: string): Promise<CompatibilityReport> {
    const shared = await this.fetchSharedDimensions(userId, otherUserId);
    if (!shared) {
      return { percentage: null, sharedDimensionCount: 0, sections: [] };
    }

    const byDimension = new Map(shared.comparisons.map((comparison) => [comparison.dimension, comparison]));
    const byCategory = new Map<string, DimensionComparison[]>();
    for (const comparison of shared.comparisons) {
      const category = categoryForDimension(comparison.dimension);
      const existing = byCategory.get(category) ?? [];
      existing.push(comparison);
      byCategory.set(category, existing);
    }

    const conflictResolution = byDimension.get('Conflict Resolution Style');
    const sectionSpecs = [
      { title: 'Communication Strengths', dimensions: byCategory.get('Communication Style') ?? [] },
      { title: 'Conflict Resolution Style', dimensions: conflictResolution ? [conflictResolution] : [] },
      { title: 'Emotional Compatibility', dimensions: byCategory.get('Emotional Values') ?? [] },
    ];

    const sections: CompatibilityReportSection[] = sectionSpecs
      .filter((spec) => spec.dimensions.length > 0)
      .map((spec) => {
        const score = this.averageSimilarity(spec.dimensions);
        return { title: spec.title, score, insight: this.insightForScore(score), dimensions: spec.dimensions };
      });

    const weights = await this.getCategoryWeights(userId);
    return {
      percentage: this.weightedAverageSimilarity(shared.comparisons, weights),
      sharedDimensionCount: shared.comparisons.length,
      sections,
    };
  }

  private insightForScore(score: number): string {
    if (score >= 85) {
      return 'Strongly aligned - this is likely to feel effortless together.';
    }
    if (score >= 65) {
      return 'Generally compatible, with some differences worth navigating.';
    }
    return 'Notably different here - worth discussing openly rather than assuming.';
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

  /**
   * Same as averageSimilarity, but each comparison is weighted by its
   * category's weight first - with every category at the default weight,
   * this reduces to the exact same result as averageSimilarity.
   */
  private weightedAverageSimilarity(
    comparisons: DimensionComparison[],
    weights: Record<string, number>,
  ): number {
    let totalWeight = 0;
    let weightedSum = 0;
    for (const comparison of comparisons) {
      const category = categoryForDimension(comparison.dimension);
      const weight = weights[category] ?? DEFAULT_CATEGORY_WEIGHT;
      totalWeight += weight;
      weightedSum += comparison.similarity * weight;
    }
    if (totalWeight === 0) {
      return 0;
    }
    return Math.round(weightedSum / totalWeight);
  }

  private toView(profile: { dimensionScores: unknown; completedAt: Date }): PersonalityProfileView {
    return {
      dimensionScores: profile.dimensionScores as Record<string, number>,
      completedAt: profile.completedAt.toISOString(),
    };
  }
}
