import { IsOptional, IsString } from 'class-validator';

export class SetIcebreakerOverlayDto {
  /** Omit (or send nothing) to clear the current overlay. */
  @IsOptional()
  @IsString()
  promptId?: string;
}
