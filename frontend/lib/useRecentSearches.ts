"use client";

import { useCallback, useEffect, useState } from "react";

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

  const persist = useCallback((next: string[]) => {
    setRecentSearches(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  }, []);

  const saveQuery = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const normalized = normalizeQuery(trimmed);
    setRecentSearches((previous) => {
      const next = [trimmed, ...previous.filter((item) => normalizeQuery(item) !== normalized)].slice(0, 5);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    persist([]);
  }, [persist]);

  const removeRecent = useCallback((query: string) => {
    const normalized = normalizeQuery(query);
    setRecentSearches((previous) => {
      const next = previous.filter((item) => normalizeQuery(item) !== normalized);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  return { recentSearches, saveQuery, clearRecent, removeRecent };
}
