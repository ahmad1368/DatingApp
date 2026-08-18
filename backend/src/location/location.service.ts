import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SEARCH_RADIUS_KM } from './location.constants';
import { haversineDistanceKm } from './utils/haversine';

export interface UpdateLocationResult {
  latitude: number;
  longitude: number;
  locationUpdatedAt: string;
}

export interface UpdateSearchRadiusResult {
  searchRadiusKm: number;
}

export interface NearbyUser {
  id: string;
  name: string | null;
  distanceKm: number;
}

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  async updateLocation(userId: string, latitude: number, longitude: number): Promise<UpdateLocationResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { latitude, longitude, locationUpdatedAt: new Date() },
    });

    return {
      latitude: user.latitude!,
      longitude: user.longitude!,
      locationUpdatedAt: user.locationUpdatedAt!.toISOString(),
    };
  }

  async updateSearchRadius(userId: string, radiusKm: number): Promise<UpdateSearchRadiusResult> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { searchRadiusKm: radiusKm },
    });

    return { searchRadiusKm: user.searchRadiusKm };
  }

  async findNearbyUsers(userId: string): Promise<NearbyUser[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    if (currentUser.latitude == null || currentUser.longitude == null) {
      throw new BadRequestException('Set your location before searching nearby users.');
    }

    const radiusKm = currentUser.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM;

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { not: userId },
        latitude: { not: null },
        longitude: { not: null },
      },
    });

    return candidates
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        distanceKm: haversineDistanceKm(
          currentUser.latitude!,
          currentUser.longitude!,
          candidate.latitude!,
          candidate.longitude!,
        ),
      }))
      .filter((candidate) => candidate.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }
}
