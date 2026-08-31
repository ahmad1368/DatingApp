import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BioWriterProvider } from './interfaces/bio-writer-provider.interface';
import { BioWriterService } from './bio-writer.service';

const USER_ID = 'user-1';

describe('BioWriterService', () => {
  let service: BioWriterService;
  let prisma: { user: { findUnique: jest.Mock } };
  let bioWriterProvider: { generateBio: jest.Mock };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    bioWriterProvider = { generateBio: jest.fn() };
    service = new BioWriterService(
      prisma as unknown as PrismaService,
      bioWriterProvider as unknown as BioWriterProvider,
    );
  });

  it('throws when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.generateBio(USER_ID, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(bioWriterProvider.generateBio).not.toHaveBeenCalled();
  });

  it('passes the dto fields straight through when hobbies are given', async () => {
    prisma.user.findUnique.mockResolvedValue({ interests: ['Hiking', 'Cooking'] });
    bioWriterProvider.generateBio.mockResolvedValue({ bios: ['A witty bio.'] });

    const result = await service.generateBio(USER_ID, {
      personalityTraits: ['Adventurous'],
      hobbies: ['Rock climbing'],
      humorStyle: 'Dry',
      existingBio: 'Old bio text',
    });

    expect(bioWriterProvider.generateBio).toHaveBeenCalledWith({
      personalityTraits: ['Adventurous'],
      hobbies: ['Rock climbing'],
      humorStyle: 'Dry',
      existingBio: 'Old bio text',
    });
    expect(result).toEqual({ bios: ['A witty bio.'] });
  });

  it('falls back to the user\'s stated interests when hobbies are omitted', async () => {
    prisma.user.findUnique.mockResolvedValue({ interests: ['Hiking', 'Cooking'] });
    bioWriterProvider.generateBio.mockResolvedValue({ bios: [] });

    await service.generateBio(USER_ID, { personalityTraits: ['Curious'] });

    expect(bioWriterProvider.generateBio).toHaveBeenCalledWith({
      personalityTraits: ['Curious'],
      hobbies: ['Hiking', 'Cooking'],
      humorStyle: null,
      existingBio: null,
    });
  });
});
