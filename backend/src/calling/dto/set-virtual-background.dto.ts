import { IsString } from 'class-validator';

export class SetVirtualBackgroundDto {
  @IsString()
  backgroundId!: string;
}
