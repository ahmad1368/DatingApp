import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { CREDENTIAL_TYPES, CredentialType } from '../work-verification.constants';

export class RequestWorkVerificationDto {
  @IsIn(CREDENTIAL_TYPES)
  type!: CredentialType;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  company?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  school?: string;
}
