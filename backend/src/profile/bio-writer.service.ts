import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateBioDto } from './dto/generate-bio.dto';
import {
  BIO_WRITER_PROVIDER,
  BioSuggestions,
  BioWriterProvider,
} from './interfaces/bio-writer-provider.interface';

@Injectable()
export class BioWriterService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(BIO_WRITER_PROVIDER) private readonly bioWriterProvider: BioWriterProvider,
  ) {}

  /**
   * AI-assisted bio writing/polishing: [dto.hobbies] falls back to the
   * user's stated interests when omitted, so a decent draft still comes
   * back even if the caller doesn't pass anything beyond personalityTraits
   * or humorStyle. Passing [dto.existingBio] switches the provider from
   * "write from scratch" to "rewrite/polish" - see BioWriterProvider.
   */
  async generateBio(userId: string, dto: GenerateBioDto): Promise<BioSuggestions> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { interests: true } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.bioWriterProvider.generateBio({
      personalityTraits: dto.personalityTraits ?? [],
      hobbies: dto.hobbies && dto.hobbies.length > 0 ? dto.hobbies : user.interests,
      humorStyle: dto.humorStyle ?? null,
      existingBio: dto.existingBio ?? null,
    });
  }
}
