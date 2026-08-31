import { ArrayMaxSize, IsArray, IsOptional, IsString, Length } from 'class-validator';

export class GenerateBioDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  personalityTraits?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  hobbies?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 50)
  humorStyle?: string;

  /** Omit to write a fresh bio from scratch; provide to rewrite/polish an existing one. */
  @IsOptional()
  @IsString()
  @Length(1, 500)
  existingBio?: string;
}
