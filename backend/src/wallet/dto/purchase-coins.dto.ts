import { IsString } from 'class-validator';

export class PurchaseCoinsDto {
  @IsString()
  packageId!: string;
}
