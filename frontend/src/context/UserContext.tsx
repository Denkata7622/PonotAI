'use client';

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import { apiFetch } from "../lib/apiFetch";
import { normalizeTrackKey } from "../../lib/dedupe";
import { t } from "../../lib/translations";
import { isOnboardingPending, markOnboardingDone, markOnboardingPending, writeTasteProfile, type TasteProfile } from "../features/onboarding/tasteProfile";

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  avatarBase64?: string | null;
  bio?: string | null;
  createdAt: string;
};

export type HistoryItem = {
  id: string;
  method?: string;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string;
  recognized?: boolean;
  createdAt?: string;
};

export type FavoriteItem = {
  id: string;
  title: string;
  artist: string;
  album?: string | null;
  coverUrl?: string | null;
  savedAt?: string;
};

export type SaveSongInput = {
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  method?: string;
  recognized?: boolean;
  createdAt?: string;
};

export type ManualSubmission = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  submittedAt: string;
};

type Preferences = {
  theme: "light" | "dark";
  notifications: boolean;
};

// ─── Local State (guest / offline) ────────────────────────────────────────────

const TOKEN_KEY = "ponotii_token";
const GUEST_STATE_KEY = "ponotii_guest_state";

type GuestState = {
  history: HistoryItem[];
  favorites: FavoriteItem[];
  manualSubmissions: ManualSubmission[];
  preferences: Preferences;
};

const defaultGuestState: GuestState = {
  history: [],
  favorites: [],
  manualSubmissions: [],
  preferences: { theme: "dark", notifications: true },
};

function loadGuestState(): GuestState {
  if (typeof window === "undefined") return defaultGuestState;
  try {
    const raw = window.localStorage.getItem(GUEST_STATE_KEY);
    if (!raw) return defaultGuestState;
    const parsed = JSON.parse(raw) as GuestState;
    return {
      ...defaultGuestState,
      ...parsed,
      preferences: { ...defaultGuestState.preferences, ...parsed.preferences },
    };
  } catch {
    return defaultGuestState;
  }
}

function saveGuestState(state: GuestState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_STATE_KEY, JSON.stringify(state));

  const persisted = window.localStorage.getItem(GUEST_STATE_KEY);
  if (!persisted) {
    console.error("Failed to persist guest state: missing localStorage value after write");
    return;
  }

  try {
    JSON.parse(persisted) as GuestState;
  } catch (error) {
    console.error("Failed to persist guest state: invalid localStorage payload", error);
  }
}

type GuestAction =
  | { type: "HYDRATE"; payload: GuestState }
  | { type: "SET_PREFERENCES"; payload: Partial<Preferences> }
  | { type: "ADD_HISTORY"; payload: HistoryItem }
  | { type: "DELETE_HISTORY_ITEM"; payload: string }
  | { type: "CLEAR_HISTORY" }
  | { type: "ADD_FAVORITE"; payload: FavoriteItem }
  | { type: "REMOVE_FAVORITE"; payload: string }
  | { type: "ADD_MANUAL_SUBMISSION"; payload: ManualSubmission }
  | { type: "RESET" };

function guestReducer(state: GuestState, action: GuestAction): GuestState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload;
    case "SET_PREFERENCES":
      return { ...state, preferences: { ...state.preferences, ...action.payload } };
    case "ADD_HISTORY":
      return { ...state, history: [action.payload, ...state.history].slice(0, 300) };
    case "DELETE_HISTORY_ITEM":
      return { ...state, history: state.history.filter((i) => i.id !== action.payload) };
    case "CLEAR_HISTORY":
      return { ...state, history: [] };
    case "ADD_FAVORITE": {
      const incomingKey = normalizeTrackKey(action.payload.title, action.payload.artist);
      const exists = state.favorites.some((favorite) => normalizeTrackKey(favorite.title, favorite.artist) === incomingKey);
      return exists ? state : { ...state, favorites: [action.payload, ...state.favorites] };
    }
    case "REMOVE_FAVORITE":
      return { ...state, favorites: state.favorites.filter((f) => f.id !== action.payload) };
    case "ADD_MANUAL_SUBMISSION":
      return { ...state, manualSubmissions: [action.payload, ...state.manualSubmissions] };
    case "RESET":
      return defaultGuestState;
    default:
      return state;
  }
}

// ─── Context Value ─────────────────────────────────────────────────────────────

type UserContextValue = {
  // Auth
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  onboardingRequired: boolean;
  register: (username: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (fields: Partial<Pick<User, "username" | "email" | "bio" | "avatarBase64">>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // Data (works for both guest and authenticated)
  history: HistoryItem[];
  favorites: FavoriteItem[];
  manualSubmissions: ManualSubmission[];
  preferences: Preferences;
  addToHistory: (item: Omit<HistoryItem, "id"> & { id?: string }) => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  addFavorite: (song: Omit<FavoriteItem, "id"> & { id?: string }) => Promise<void>;
  removeFavorite: (id: string) => Promise<void>;
  saveToLibrary: (song: SaveSongInput) => Promise<void>;
  addManualSubmission: (submission: ManualSubmission) => void;
  shareSong: (song: { title: string; artist: string; album?: string; coverUrl?: string }) => Promise<string | null>;
  setPreferences: (prefs: Partial<Preferences>) => void;
  deleteAccount: () => Promise<void>;
  completeOnboarding: (profile?: TasteProfile) => void;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  // Auth state (server)
  const [authState, setAuthState] = useReducer(
    (
      prev: { user: User | null; token: string | null; isLoading: boolean },
      next: Partial<{ user: User | null; token: string | null; isLoading: boolean }>
    ) => ({ ...prev, ...next }),
    { user: null, token: null, isLoading: true }
  );

  // Server-fetched data (when authenticated)
  const [serverHistory, setServerHistory] = useReducer(
    (_: HistoryItem[], next: HistoryItem[]) => next,
    []
  );
  const [serverFavorites, setServerFavorites] = useReducer(
    (_: FavoriteItem[], next: FavoriteItem[]) => next,
    []
  );

  // Guest / offline state
  const [guest, dispatchGuest] = useReducer(guestReducer, defaultGuestState);
  const [guestHydrated, setGuestHydrated] = useState(false);

  const isAuthenticated = Boolean(authState.token && authState.user);
  const [onboardingRequired, setOnboardingRequired] = useState(false);

  useEffect(() => {
    dispatchGuest({ type: "HYDRATE", payload: loadGuestState() });
    setGuestHydrated(true);
  }, []);

  // Persist guest state
  useEffect(() => {
    if (!guestHydrated) return;
    saveGuestState(guest);
  }, [guest, guestHydrated]);

  // Hydration-safe token bootstrap
  useEffect(() => {
    const storedToken = typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setAuthState({ isLoading: false });
      setOnboardingRequired(false);
      return;
    }
    setOnboardingRequired(isOnboardingPending());
    setAuthState({ token: storedToken, isLoading: true });
  }, []);

  // Apply theme
  const activePreferences = guest.preferences;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", activePreferences.theme === "dark");
  }, [activePreferences.theme]);

  async function fetchServerData() {
    const [histRes, favRes] = await Promise.all([
      apiFetch("/api/history?limit=50"),
      apiFetch("/api/favorites"),
    ]);
    if (histRes.ok) {
      const payload = (await histRes.json()) as { items: HistoryItem[] };
      setServerHistory(payload.items || []);
    }
    if (favRes.ok) {
      const payload = (await favRes.json()) as { items: FavoriteItem[] };
      setServerFavorites(payload.items || []);
    }
  }

  // On mount: validate token and fetch server data
  useEffect(() => {
    if (!authState.token) return;

    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) throw new Error("UNAUTHORIZED");
        const payload = (await res.json()) as User | { user?: User; token?: string };
        const me = ("user" in payload && payload.user
          ? payload.user
          : payload) as User;
        if ("token" in payload && payload.token && typeof window !== "undefined") {
          localStorage.setItem(TOKEN_KEY, payload.token);
        }
        setAuthState({ user: me });
        await fetchServerData();
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        markOnboardingDone();
        setOnboardingRequired(false);
        setAuthState({ token: null, user: null });
      })
      .finally(() => setAuthState({ isLoading: false }));
  }, [authState.token]);

  async function handleAuthSuccess(payload: { token: string; user: User }) {
    localStorage.setItem(TOKEN_KEY, payload.token);
    setAuthState({ token: payload.token, user: payload.user, isLoading: false });
  }

  // ─── Auth Actions ────────────────────────────────────────────────────────────

  async function register(username: string, email: string, password: string) {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "REGISTER_FAILED");
    await handleAuthSuccess(data as { token: string; user: User });
    markOnboardingPending();
    setOnboardingRequired(true);
  }

  async function login(email: string, password: string) {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LOGIN_FAILED");
    await handleAuthSuccess(data as { token: string; user: User });
    markOnboardingDone();
    setOnboardingRequired(false);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem(TOKEN_KEY);
    setOnboardingRequired(false);
    setAuthState({ token: null, user: null, isLoading: false });
    setServerHistory([]);
    setServerFavorites([]);
  }

  async function updateProfile(fields: Partial<Pick<User, "username" | "email" | "bio" | "avatarBase64">>) {
    const res = await apiFetch("/api/auth/me", { method: "PATCH", body: JSON.stringify(fields) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "UPDATE_FAILED");
    setAuthState({ user: data as User });
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    const res = await apiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "PASSWORD_CHANGE_FAILED");
    }
  }

  async function deleteAccount() {
    if (isAuthenticated) {
      const res = await apiFetch("/api/auth/me", { method: "DELETE" });
      if (!res.ok) throw new Error("DELETE_ACCOUNT_FAILED");
      await logout();
    }
    localStorage.clear();
    setOnboardingRequired(false);
    dispatchGuest({ type: "RESET" });
  }

  // ─── Data Actions (hybrid) ────────────────────────────────────────────────────

  function completeOnboarding(profile?: TasteProfile) {
    if (profile) {
      writeTasteProfile(profile);
    }
    markOnboardingDone();
    setOnboardingRequired(false);
  }

  function notify(messageKey: "toast_already_favorited" | "toast_duplicate_history") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("ponotai-toast", { detail: { key: messageKey, text: t(messageKey, "bg") } }));
  }

  async function addToHistory(item: Omit<HistoryItem, "id"> & { id?: string }) {
    const incomingKey = normalizeTrackKey(item.title ?? "", item.artist ?? "");

    if (isAuthenticated) {
      const duplicate = serverHistory.find(
        (entry) => normalizeTrackKey(entry.title ?? "", entry.artist ?? "") === incomingKey,
      );
      if (duplicate) {
        await apiFetch(`/api/history/${duplicate.id}`, { method: "DELETE" });
        notify("toast_duplicate_history");
      }

      const res = await apiFetch("/api/history", { method: "POST", body: JSON.stringify(item) });
      if (res.ok) {
        const created = (await res.json()) as HistoryItem;
        setServerHistory([created, ...serverHistory.filter((entry) => entry.id !== duplicate?.id)]);
      }
      return;
    }
    dispatchGuest({
      type: "ADD_HISTORY",
      payload: { id: item.id ?? crypto.randomUUID(), ...item },
    });
  }

  async function deleteHistoryItem(id: string) {
    if (isAuthenticated) {
      const response = await apiFetch(`/api/history/${id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("DELETE_HISTORY_FAILED");
      }
      setServerHistory(serverHistory.filter((e) => e.id !== id));
      return;
    }
    dispatchGuest({ type: "DELETE_HISTORY_ITEM", payload: id });
  }

  async function clearHistory() {
    if (isAuthenticated) {
      const response = await apiFetch("/api/history", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("CLEAR_HISTORY_FAILED");
      }
      setServerHistory([]);
      return;
    }
    dispatchGuest({ type: "CLEAR_HISTORY" });
  }

  async function addFavorite(song: Omit<FavoriteItem, "id"> & { id?: string }) {
    const incomingKey = normalizeTrackKey(song.title, song.artist);
    const existingFavorite = (isAuthenticated ? serverFavorites : guest.favorites).find(
      (item) => normalizeTrackKey(item.title, item.artist) === incomingKey,
    );
    if (existingFavorite) {
      notify("toast_already_favorited");
      return;
    }

    if (isAuthenticated) {
      const res = await apiFetch("/api/favorites", { method: "POST", body: JSON.stringify(song) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "FAVORITE_FAILED");
      setServerFavorites([data as FavoriteItem, ...serverFavorites]);
      return;
    }
    dispatchGuest({
      type: "ADD_FAVORITE",
      payload: { id: song.id ?? crypto.randomUUID(), title: song.title, artist: song.artist, album: song.album ?? null, coverUrl: song.coverUrl ?? null },
    });
  }

  async function removeFavorite(id: string) {
    if (isAuthenticated) {
      const resolvedId = serverFavorites.find((favorite) => favorite.id === id)?.id
        ?? serverFavorites.find((favorite) => normalizeTrackKey(favorite.title, favorite.artist) === id)?.id;

      if (!resolvedId) {
        console.error("Failed to remove favorite: could not resolve backend favorite id", { id });
        return;
      }

      const res = await apiFetch(`/api/favorites/${resolvedId}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("Failed to remove favorite via API", { id, resolvedId, status: res.status });
        return;
      }

      setServerFavorites(serverFavorites.filter((f) => f.id !== resolvedId));
      return;
    }
    const resolvedId = guest.favorites.find((favorite) => favorite.id === id)?.id
      ?? guest.favorites.find((favorite) => normalizeTrackKey(favorite.title, favorite.artist) === id)?.id;
    if (!resolvedId) return;
    dispatchGuest({ type: "REMOVE_FAVORITE", payload: resolvedId });
  }

  async function saveToLibrary(song: SaveSongInput) {
    await addToHistory({
      title: song.title,
      artist: song.artist,
      album: song.album,
      coverUrl: song.coverUrl,
      method: song.method ?? "library-save",
      recognized: song.recognized ?? true,
      createdAt: song.createdAt ?? new Date().toISOString(),
    });
    await addFavorite({
      title: song.title,
      artist: song.artist,
      album: song.album,
      coverUrl: song.coverUrl,
    });
  }

  async function shareSong(song: { title: string; artist: string; album?: string; coverUrl?: string }) {
    if (!isAuthenticated) {
      alert("Влез в профила си, за да споделяш песни.");
      return null;
    }
    const res = await apiFetch("/api/share", { method: "POST", body: JSON.stringify(song) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "SHARE_FAILED");
    return (data as { shareUrl: string }).shareUrl;
  }

  function setPreferences(prefs: Partial<Preferences>) {
    dispatchGuest({ type: "SET_PREFERENCES", payload: prefs });
  }

  function addManualSubmission(submission: ManualSubmission) {
    dispatchGuest({ type: "ADD_MANUAL_SUBMISSION", payload: submission });
  }

  // ─── Compose value ────────────────────────────────────────────────────────────

  const value = useMemo<UserContextValue>(
    () => ({
      user: authState.user,
      token: authState.token,
      isAuthenticated,
      isLoading: authState.isLoading,
      onboardingRequired,
      register,
      login,
      logout,
      updateProfile,
      changePassword,
      history: isAuthenticated ? serverHistory : guest.history,
      favorites: isAuthenticated ? serverFavorites : guest.favorites,
      manualSubmissions: guest.manualSubmissions,
      preferences: guest.preferences,
      addToHistory,
      deleteHistoryItem,
      clearHistory,
      addFavorite,
      removeFavorite,
      saveToLibrary,
      addManualSubmission,
      shareSong,
      setPreferences,
      deleteAccount,
      completeOnboarding,
    }),
        [authState, serverHistory, serverFavorites, guest, isAuthenticated, onboardingRequired]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider");
  return context;
}
