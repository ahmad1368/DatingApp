export interface AvatarStyle {
  id: string;
  label: string;
  previewUrl: string;
}

// Curated 3D avatar presets a user can pick as their profile header - no
// real 3D avatar-creation engine exists in this codebase (see
// scorePhotoQuality in profile-photos.service.ts for the same
// "stand in with curated content" approach), so each style is just a
// static preview image.
export const AVATAR_STYLES: AvatarStyle[] = [
  { id: 'cosmic-explorer', label: 'Cosmic Explorer', previewUrl: 'https://cdn.example.com/avatars/cosmic-explorer.png' },
  { id: 'retro-arcade', label: 'Retro Arcade', previewUrl: 'https://cdn.example.com/avatars/retro-arcade.png' },
  { id: 'minimalist-line-art', label: 'Minimalist Line Art', previewUrl: 'https://cdn.example.com/avatars/minimalist-line-art.png' },
  { id: 'pastel-dreamer', label: 'Pastel Dreamer', previewUrl: 'https://cdn.example.com/avatars/pastel-dreamer.png' },
  { id: 'street-style', label: 'Street Style', previewUrl: 'https://cdn.example.com/avatars/street-style.png' },
  { id: 'fantasy-adventurer', label: 'Fantasy Adventurer', previewUrl: 'https://cdn.example.com/avatars/fantasy-adventurer.png' },
];

export function findAvatarStyle(id: string): AvatarStyle | undefined {
  return AVATAR_STYLES.find((style) => style.id === id);
}
