# Recognition flow audit (April 13, 2026)

## Current request behavior before this patch

- `/api/recognition/audio*` executed provider chain (AuDD -> ACRCloud -> Shazam) sequentially with provider-level retries.
- AuDD also performed an internal YouTube lookup, which could amplify calls during retries/fallbacks.
- No per-attempt provider cap existed beyond chain length.
- No attempt-level dedupe existed for repeated frontend submits.
- OCR image flow used lookup-by-title on each candidate and could trigger repeated metadata lookups.
- Frontend allowed rapid retries and did not send stable attempt IDs.

## Risks identified

- Duplicate submits could create repeated external provider calls for the same clip.
- Metadata/YouTube lookup was not centrally budgeted.
- Provider retries + fallback chain could burn free-tier quotas quickly.
- No circuit behavior for quota exhaustion/overload.

## Fix direction

- Central attempt guard: stable attempt IDs, dedupe keys, request budgets, provider cooldown/circuit behavior.
- Sequential bounded multi-stage orchestration with early stop.
- Explicit low-confidence states with alternatives instead of blind retries.
- Frontend duplicate-request suppression and in-flight cancellation.
