export interface CommunityGroup {
  id: string;
  name: string;
  description: string;
}

export const COMMUNITY_GROUPS: CommunityGroup[] = [
  { id: 'outdoor-adventurers', name: 'Outdoor Adventurers', description: 'Hiking, camping, and everything outside.' },
  { id: 'book-lovers', name: 'Book Lovers', description: 'Bookworms and everything literary.' },
  { id: 'foodies', name: 'Foodies', description: 'Cooking, trying new restaurants, and all things food.' },
  { id: 'fitness-enthusiasts', name: 'Fitness Enthusiasts', description: 'Gym, running, and staying active together.' },
  { id: 'music-heads', name: 'Music Heads', description: 'Concerts, playlists, and discovering new artists.' },
  { id: 'gamers', name: 'Gamers', description: 'Video games, board games, and everything in between.' },
  { id: 'pet-parents', name: 'Pet Parents', description: 'Dog people, cat people, and everyone who loves animals.' },
  { id: 'travel-junkies', name: 'Travel Junkies', description: 'Always planning the next trip.' },
];

export const COMMUNITY_GROUP_IDS = COMMUNITY_GROUPS.map((group) => group.id);

export const MAX_COMMUNITY_GROUP_MEMBERSHIPS = 5;

export function findCommunityGroup(groupId: string): CommunityGroup | undefined {
  return COMMUNITY_GROUPS.find((group) => group.id === groupId);
}
