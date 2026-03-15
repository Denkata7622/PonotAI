"use client";

import { useEffect, useState } from "react";

const RECENT_SEARCHES_KEY = "trackly.search.recent";

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setRecentSearches(Array.isArray(parsed) ? parsed.slice(0, 5) : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  function persist(next: string[]) {
    setRecentSearches(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  }

  function saveQuery(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const normalized = normalizeQuery(trimmed);
    const next = [trimmed, ...recentSearches.filter((item) => normalizeQuery(item) !== normalized)].slice(0, 5);
    persist(next);
  }

  function clearRecent() {
    persist([]);
  }

  function removeRecent(query: string) {
    const normalized = normalizeQuery(query);
    persist(recentSearches.filter((item) => normalizeQuery(item) !== normalized));
  }

  return { recentSearches, saveQuery, clearRecent, removeRecent };
}
