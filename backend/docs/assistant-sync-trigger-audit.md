# Assistant + library sync duplicate-trigger audit

Date: 2026-04-14

## Paths inspected

- `frontend/src/features/assistant/components/MusicAssistantPage.tsx`
- `frontend/src/features/assistant/useMusicAssistant.ts`
- `frontend/src/features/assistant/components/ActionCard.tsx`
- `frontend/src/features/assistant/api.ts`
- `backend/src/routes/assistant.ts`
- `backend/src/modules/library/library.controller.ts`

## Findings

1. Assistant provider logs (`[assistant] provider attempt`) may legitimately appear more than once for one user message because retry behavior is intentional (`MAX_RETRIES = 2`) in `geminiClient`.
2. Library sync safe-write logging (`[assistant-safe-write] library.sync`) originates from a single backend location (`syncLibraryController`), so duplicate log lines imply duplicate route invocations.
3. Frontend action execution (`ActionCard.handleAccept`) used `useState` (`busy`) as its only in-flight guard.
4. React state updates are async; a rapid double click can call `handleAccept` twice before `busy` re-renders to `true`, causing duplicate assistant action requests (including library sync).
5. `useMusicAssistant.sendMessage` already has a synchronous ref lock (`inFlightRef`) and is less likely to double-send under the same pattern.

## Conclusion

Duplicate assistant/library writes are most plausibly caused by rapid repeated action-card accepts (user double click / event burst), not by OCR, and not by Express route fan-out. A synchronous in-memory guard at action execution is needed.
