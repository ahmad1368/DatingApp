import { IsObject } from 'class-validator';

export class SetCompatibilityWeightsDto {
  /** Category name -> weight (0-2); validated against PERSONALITY_CATEGORIES in the service. */
  @IsObject()
  weights!: Record<string, number>;
}
