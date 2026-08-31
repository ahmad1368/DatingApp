import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateBioDto } from './dto/generate-bio.dto';
import { BioWriterService } from './bio-writer.service';

@Controller('profile/bio')
@UseGuards(JwtAuthGuard)
export class BioWriterController {
  constructor(private readonly bioWriterService: BioWriterService) {}

  @Post('generate')
  generateBio(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateBioDto) {
    return this.bioWriterService.generateBio(user.id, dto);
  }
}
