import { IsIn } from 'class-validator';
import { ACTIVE_MODES } from '../discovery.constants';

export class SetActiveModeDto {
  @IsIn(ACTIVE_MODES)
  mode!: string;
}
