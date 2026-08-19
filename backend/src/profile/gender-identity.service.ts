import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetGenderIdentityDto } from './dto/set-gender-identity.dto';

export interface GenderIdentityResult {
  genderIdentities: string[];
  customGenderDescription: string | null;
  showGenderOnProfile: boolean;
  orientations: string[];
  customOrientationDescription: string | null;
  showOrientationOnProfile: boolean;
}

@Injectable()
export class GenderIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async getGenderIdentity(userId: string): Promise<GenderIdentityResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        genderIdentities: true,
        customGenderDescription: true,
        showGenderOnProfile: true,
        orientations: true,
        customOrientationDescription: true,
        showOrientationOnProfile: true,
      },
    });

    return {
      genderIdentities: user?.genderIdentities ?? [],
      customGenderDescription: user?.customGenderDescription ?? null,
      showGenderOnProfile: user?.showGenderOnProfile ?? true,
      orientations: user?.orientations ?? [],
      customOrientationDescription: user?.customOrientationDescription ?? null,
      showOrientationOnProfile: user?.showOrientationOnProfile ?? true,
    };
  }

  async setGenderIdentity(userId: string, dto: SetGenderIdentityDto): Promise<GenderIdentityResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        genderIdentities: dto.genderIdentities,
        customGenderDescription: dto.customGenderDescription ?? null,
        showGenderOnProfile: dto.showGenderOnProfile,
        orientations: dto.orientations,
        customOrientationDescription: dto.customOrientationDescription ?? null,
        showOrientationOnProfile: dto.showOrientationOnProfile,
      },
    });

    return {
      genderIdentities: user.genderIdentities,
      customGenderDescription: user.customGenderDescription,
      showGenderOnProfile: user.showGenderOnProfile,
      orientations: user.orientations,
      customOrientationDescription: user.customOrientationDescription,
      showOrientationOnProfile: user.showOrientationOnProfile,
    };
  }
}
