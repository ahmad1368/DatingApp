import { IsString, MinLength } from 'class-validator';

export class SubmitSdpDto {
  @IsString()
  @MinLength(1)
  sdp!: string;
}
