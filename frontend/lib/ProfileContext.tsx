"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const ACTIVE_PROFILE_ID_KEY = "ponotai.profile.active";
const PROFILES_KEY = "ponotai.profiles";

export type Profile = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type ProfileContextValue = {
  profile: Profile;
  profiles: Profile[];
  switchProfile: (id: string) => void;
  createProfile: (name: string, email?: string) => Profile;
  updateProfile: (input: Partial<Pick<Profile, "name" | "email">>) => void;
  deleteProfile: (id: string) => void;
};

const defaultProfile: Profile = {
  id: "default",
  name: "Guest",
  email: "",
  createdAt: new Date(0).toISOString(),
};

function normalizeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Profile>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return null;

  return {
    id: candidate.id,
    name: candidate.name,
    email: typeof candidate.email === "string" ? candidate.email : "",
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
  };
}

function safeParseProfiles(raw: string | null): Profile[] {
  if (!raw) return [defaultProfile];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultProfile];
    const normalized = parsed.map(normalizeProfile).filter((profile): profile is Profile => Boolean(profile));
    return normalized.length > 0 ? normalized : [defaultProfile];
  } catch {
    return [defaultProfile];
  }
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function scopedKey(baseKey: string, profileId: string): string {
  return `${baseKey}.${profileId}`;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [{ profiles, activeId }, setState] = useState<{ profiles: Profile[]; activeId: string }>({
    profiles: [defaultProfile],
    activeId: defaultProfile.id,
  });

  useEffect(() => {
    const nextProfiles = safeParseProfiles(window.localStorage.getItem(PROFILES_KEY));
    const storedActiveId = window.localStorage.getItem(ACTIVE_PROFILE_ID_KEY) ?? nextProfiles[0]?.id ?? defaultProfile.id;
    const hasActive = nextProfiles.some((candidate) => candidate.id === storedActiveId);
    setState({
      profiles: nextProfiles,
      activeId: hasActive ? storedActiveId : nextProfiles[0]?.id ?? defaultProfile.id,
    });
  }, []);

  const profile = useMemo(() => profiles.find((p) => p.id === activeId) ?? profiles[0] ?? defaultProfile, [activeId, profiles]);

  function persist(nextProfiles: Profile[], nextActiveId: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(nextProfiles));
    window.localStorage.setItem(ACTIVE_PROFILE_ID_KEY, nextActiveId);
  }

  function switchProfile(id: string) {
    setState((prev) => {
      const nextActiveId = prev.profiles.some((p) => p.id === id) ? id : prev.activeId;
      persist(prev.profiles, nextActiveId);
      return { profiles: prev.profiles, activeId: nextActiveId };
    });
  }

  function createProfile(name: string, email = ""): Profile {
    const trimmedName = name.trim() || `User ${profiles.length + 1}`;
    const newProfile: Profile = {
      id: `profile-${crypto.randomUUID()}`,
      name: trimmedName,
      email: email.trim(),
      createdAt: new Date().toISOString(),
    };

    setState((prev) => {
      const nextProfiles = [...prev.profiles, newProfile];
      persist(nextProfiles, newProfile.id);
      return { profiles: nextProfiles, activeId: newProfile.id };
    });
    return newProfile;
  }

  function updateProfile(input: Partial<Pick<Profile, "name" | "email">>) {
    setState((prev) => {
      const nextProfiles = prev.profiles.map((candidate) => {
        if (candidate.id !== prev.activeId) return candidate;
        return {
          ...candidate,
          name: input.name !== undefined ? input.name.trim() || candidate.name : candidate.name,
          email: input.email !== undefined ? input.email.trim() : candidate.email,
        };
      });
      persist(nextProfiles, prev.activeId);
      return { profiles: nextProfiles, activeId: prev.activeId };
    });
  }

  function deleteProfile(id: string) {
    setState((prev) => {
      if (prev.profiles.length <= 1 || !prev.profiles.some((item) => item.id === id)) {
        return prev;
      }

      const nextProfiles = prev.profiles.filter((item) => item.id !== id);
      const nextActiveId = prev.activeId === id ? nextProfiles[0]?.id ?? defaultProfile.id : prev.activeId;
      persist(nextProfiles, nextActiveId);
      return { profiles: nextProfiles, activeId: nextActiveId };
    });
  }

  return <ProfileContext.Provider value={{ profile, profiles, switchProfile, createProfile, updateProfile, deleteProfile }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
