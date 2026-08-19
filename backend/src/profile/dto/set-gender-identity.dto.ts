import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import {
  GENDER_IDENTITIES,
  MAX_CUSTOM_DESCRIPTION_LENGTH,
  MAX_GENDER_SELECTIONS,
  MAX_ORIENTATION_SELECTIONS,
  SEXUAL_ORIENTATIONS,
} from '../gender-identity.constants';

export class SetGenderIdentityDto {
  @IsArray()
  @ArrayMaxSize(MAX_GENDER_SELECTIONS)
  @IsIn(GENDER_IDENTITIES, { each: true })
  genderIdentities!: string[];

  @IsOptional()
  @IsString()
  @Length(1, MAX_CUSTOM_DESCRIPTION_LENGTH)
  customGenderDescription?: string;

  @IsBoolean()
  showGenderOnProfile!: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_ORIENTATION_SELECTIONS)
  @IsIn(SEXUAL_ORIENTATIONS, { each: true })
  orientations!: string[];

  @IsOptional()
  @IsString()
  @Length(1, MAX_CUSTOM_DESCRIPTION_LENGTH)
  customOrientationDescription?: string;

  @IsBoolean()
  showOrientationOnProfile!: boolean;
}
