export interface PlatformStrings {
  name: string;
  handle: string;
}

export type PlatformsStrings = Record<
  'vinted' | 'tiktok' | 'instagram' | 'youtube' | 'facebook',
  PlatformStrings
>;
