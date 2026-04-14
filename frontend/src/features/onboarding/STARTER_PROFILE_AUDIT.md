# Starter profile audit (April 14, 2026)

## Current shape

Current onboarding persists this payload in `trackly.onboarding.taste-profile`:

- `genres: string[]`
- `artists: string[]`
- `moods: string[]`
- `goals: string[]`
- `completedAt: string`
- `skipped?: boolean`

## Inputs currently using open text

`frontend/src/screens/OnboardingPage.tsx` currently captures most onboarding data from comma-separated free text:

- `genres` (`input` text)
- `artists` (`input` text)
- `moods` (`input` text)
- `goals` (`input` text)

Additional selects:

- `vibe` select: appended into `moods`
- `discoveryStyle` select: appended into `goals`

## What is already structured

- Saved profile uses arrays, so downstream code can iterate and rank terms.
- The onboarding gate/auth routing flow is already solid and should be preserved.

## What AI/recommendation logic can use directly today

Assistant requests send `genres`, `artists`, `moods`, and `goals` to backend via `X-Trackly-Preferences`.

Backend context uses these values as starter cues when listening history is sparse.

## Data quality problems

- Comma-separated text leads to inconsistent casing, spelling, and synonyms.
- "Preferred vibe" and "Recommendation style" are merged into broad arrays, losing semantic meaning.
- Open text is hard to score for recommendation constraints and confidence.
- Optional artists are over-emphasized despite weaker normalization.

## Structured redesign direction

Preserve backward-compatible arrays while introducing normalized structured fields:

- `recommendationStyle`: `familiar | balanced | discovery`
- `energy`: `low | medium | high | mixed`
- `discoveryOpenness`: `low | medium | high`
- `vibe`: closed list
- `contexts`: closed-list multi-select

And keep optional fallbacks:

- `otherGenres: string[]`
- `favoriteArtists: string[]` (optional, compact)

The UI should make structured selection primary, with open text only as optional fallback.
