import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DateSuggestionsController } from './date-suggestions.controller';
import { DateSuggestionsService } from './date-suggestions.service';

@Module({
  imports: [AuthModule],
  controllers: [DateSuggestionsController],
  providers: [DateSuggestionsService],
})
export class DateSuggestionsModule {}
