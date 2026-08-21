import { IsString, Length } from 'class-validator';

export class PostStreamCommentDto {
  @IsString()
  @Length(1, 300)
  text!: string;
}
