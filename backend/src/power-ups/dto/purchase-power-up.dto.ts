import { IsString } from 'class-validator';

export class PurchasePowerUpDto {
  @IsString()
  powerUpId!: string;
}
