import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';
import { CALL_TYPES } from '../calling.constants';

export class InitiateCallDto {
  @IsUUID()
  calleeId!: string;

  @IsIn(CALL_TYPES)
  type!: string;

  @IsString()
  @MinLength(1)
  offerSdp!: string;
}
