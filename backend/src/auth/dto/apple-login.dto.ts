import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  /** Only present on the user's first authorization; Apple omits it afterwards. */
  @IsOptional()
  @IsString()
  fullName?: string;
}
