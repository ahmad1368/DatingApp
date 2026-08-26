import { IsString, Length } from 'class-validator';

export class AddEmergencyContactDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 50)
  phone!: string;
}
