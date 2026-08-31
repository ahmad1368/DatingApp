import { IsString } from 'class-validator';

export class SetAppearanceFilterDto {
  @IsString()
  filterId!: string;
}
