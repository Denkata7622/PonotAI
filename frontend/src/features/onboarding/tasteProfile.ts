export type TasteProfile = {
  genres: string[];
  artists: string[];
  moods: string[];
  goals: string[];
  completedAt: string;
  skipped?: boolean;
};

export const TASTE_PROFILE_KEY = "trackly.onboarding.taste-profile";
export const ONBOARDING_PENDING_KEY = "trackly.onboarding.pending";

export function readTasteProfile(): TasteProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TASTE_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TasteProfile;
    return parsed;
  } catch {
    return null;
  }
}

export function isOnboardingPending(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ONBOARDING_PENDING_KEY) === "pending";
}

export function markOnboardingPending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_PENDING_KEY, "pending");
}

export function markOnboardingDone(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ONBOARDING_PENDING_KEY, "done");
}

export function writeTasteProfile(profile: TasteProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TASTE_PROFILE_KEY, JSON.stringify(profile));
  markOnboardingDone();
}
