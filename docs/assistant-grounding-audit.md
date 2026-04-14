# Assistant Grounding & Capability Audit (2026-04-14)

## End-to-end path reviewed
1. `POST /api/assistant` input sanitization, conversation validation, context build, prompt build, model call, action parse.
2. `buildLibraryContext` grounding payload assembly from history/favorites/playlists + stated preferences.
3. `buildSystemPrompt` policy and action contract.
4. `parseActionIntent` schema validation/normalization.
5. Frontend `sendAssistantMessage` + `ActionCard` confirmation execution.

## Current strengths
- Strong action-block parsing guardrails and confirmation-gated writes.
- Cross-artist discovery endpoint already supports out-of-library candidates.
- Context data richness classification exists (`sparse`/`growing`/`rich`).

## Gaps identified
- Usage analysis in context is still shallow:
  - No explicit short-term vs long-term artist/genre deltas.
  - Limited time-of-day behavior summaries and no strongest slot diagnostics.
  - No underused-favorites signal despite favorites + recency being available.
- Recommendations can still feel generic when data exists:
  - Prompt does not force evidence hierarchy strongly enough for recency-vs-baseline.
  - Sparse/fallback reasoning is present but not consistently structured.
- Theme actions are constrained to base controls (theme/accent/density/template) even though the app supports richer personalization controls.
- Action reliability gap in UI:
  - Some action types report success toast/state even when no meaningful backend result is returned.
- Admin convenience gap:
  - Demo account generation exists, but there is no one-click “log in as admin demo” flow.

## Data available for grounding (confirmed)
- History entries + timestamps + method + recognized outcome.
- Favorites with save times.
- Playlist composition and song metadata.
- Repeated artist and recency windows from history.
- Onboarding stated preferences (genres/artists/moods/goals) through request headers.
- Active UI personalization and runtime theme context headers.

## Planned implementation focus
- Expand context analytics with explicit trend deltas, time-slot signatures, replay/novelty balance, and underused favorites.
- Improve recommendation explainability labels and fallback honesty.
- Extend theme action schema to validated personalization controls already supported by runtime.
- Tighten action execution success conditions in frontend.
- Add secure admin-only one-click demo-admin login route and UI control.
