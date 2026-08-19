import { IsUUID } from 'class-validator';

export class ReferApplicantDto {
  @IsUUID()
  applicantUserId!: string;
}
