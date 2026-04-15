import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { assistantRateLimit } from "../middlewares/rateLimit.middleware";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";
import { buildLibraryContext } from "../services/assistant/contextBuilder";
import { buildSystemPrompt } from "../services/assistant/prompt";
import { generateAssistantReply } from "../services/assistant/geminiClient";
import { parseActionIntent } from "../services/assistant/actionParser";
import type { GeminiHistoryMessage, GeminiMessage } from "../types/assistant";

const assistantRouter = Router();

type UserBucket = { count: number; windowStartedAt: number };
const buckets = new Map<string, UserBucket>();

function enforceUserRateLimit(userId: string): boolean {
  const now = Date.now();
  const existing = buckets.get(userId);

  if (!existing || now - existing.windowStartedAt > 60_000) {
    buckets.set(userId, { count: 1, windowStartedAt: now });
    return true;
  }

  if (existing.count >= 20) {
    return false;
  }

  existing.count += 1;
  return true;
}

function stripActionTags(input: string): string {
  return input.replace(/<action>[\s\S]*?<\/action>/gi, "").trim();
}

function sanitizeUserMessage(input: string): string {
  const stripped = stripActionTags(input);
  return stripped.replace(/(ignore previous instructions|reveal system prompt|show hidden prompt)/gi, "[filtered]");
}

function validateConversation(payload: unknown): payload is GeminiMessage[] {
  if (!Array.isArray(payload) || payload.length > 15) return false;

  return payload.every((item) => {
    if (!item || typeof item !== "object") return false;
    const obj = item as { role?: unknown; content?: unknown };
    return (
      (obj.role === "user" || obj.role === "assistant")
      && typeof obj.content === "string"
      && obj.content.length <= 1000
    );
  });
}

assistantRouter.use(assistantRateLimit);
assistantRouter.use(requireAuth);

assistantRouter.post("/", async (req, res) => {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return res.status(503).json({
      code: "AI_SERVICE_UNAVAILABLE",
      message: "AI Assistant is not configured correctly. Please contact support.",
    });
  }

  const userId = req.userId!;
  if (!enforceUserRateLimit(userId)) {
    sendError(res, ErrorCatalog.RATE_LIMIT_EXCEEDED, { limit: 20, windowSeconds: 60 });
    return;
  }

  const body = req.body as {
    message?: unknown;
    conversation?: unknown;
    context?: {
      queueTitles?: unknown;
      theme?: unknown;
      language?: unknown;
      preferences?: unknown;
      device?: unknown;
    };
  };

  if (typeof body.message !== "string" || body.message.length < 1 || body.message.length > 2000) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "message", min: 1, max: 2000 });
    return;
  }

  if (!validateConversation(body.conversation)) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "conversation", maxItems: 15 });
    return;
  }

  const message = sanitizeUserMessage(body.message).slice(0, 2000);
  const conversation = body.conversation.map((item) => ({
    role: item.role,
    content: sanitizeUserMessage(item.content),
  }));
  const geminiHistory: GeminiHistoryMessage[] = conversation.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));

  try {
    const statedPreferences = (() => {
      if (body.context?.preferences && typeof body.context.preferences === "object") {
        const parsed = body.context.preferences as { genres?: string[]; artists?: string[]; moods?: string[]; goals?: string[] };
        return parsed;
      }
      const raw = req.headers["x-trackly-preferences"];
      if (typeof raw !== "string" || !raw.trim()) return undefined;
      try {
        const parsed = JSON.parse(raw) as { genres?: string[]; artists?: string[]; moods?: string[]; goals?: string[] };
        return parsed;
      } catch {
        return undefined;
      }
    })();
    const queueFromBody = Array.isArray(body.context?.queueTitles)
      ? body.context?.queueTitles
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
      : [];
    const currentTheme = body.context?.theme === "light" || body.context?.theme === "dark" || body.context?.theme === "system"
      ? body.context.theme
      : req.headers["x-trackly-theme"] as "light" | "dark" | "system" | undefined;
    const currentLanguage = body.context?.language === "en" || body.context?.language === "bg"
      ? body.context.language
      : req.headers["x-trackly-language"] as "en" | "bg" | undefined;
    const deviceType = typeof body.context?.device === "string" && body.context.device.trim()
      ? body.context.device.trim().slice(0, 120)
      : typeof req.headers["x-trackly-device"] === "string"
        ? req.headers["x-trackly-device"]
        : undefined;
    const context = await buildLibraryContext(userId, {
      currentTheme,
      currentLanguage,
      currentQueue: queueFromBody.length > 0
        ? queueFromBody
        : typeof req.headers["x-trackly-queue"] === "string"
        ? req.headers["x-trackly-queue"].split("|").filter(Boolean).slice(0, 10)
        : [],
      deviceType,
      statedPreferences,
    });
    if (context.topTracks.length === 0) {
      const hasStatedPreferences = Boolean(
        context.statedPreferences
        && (
          context.statedPreferences.genres.length
          || context.statedPreferences.artists.length
          || context.statedPreferences.moods.length
          || context.statedPreferences.goals.length
        ),
      );
      res.status(200).json({
        reply: hasStatedPreferences
          ? "Based on your stated preferences, I can start with discovery suggestions right away. Once you build listening history, I’ll switch to history-grounded recommendations."
          : "Your library is empty right now. Tell me your favorite genres, artists, moods, or goals and I’ll personalize recommendations until your listening history grows.",
        actionIntent: null,
        meta: { model: "fallback", latencyMs: 0, contextTracksCount: 0 },
      });
      return;
    }
    const systemPrompt = buildSystemPrompt(context);
    const result = await generateAssistantReply(systemPrompt, geminiHistory, message);
    if (!result.text?.trim()) {
      sendError(res, ErrorCatalog.AI_SERVICE_UNAVAILABLE, { message: "I couldn't generate a response. Please rephrase your question." });
      return;
    }
    const parsed = parseActionIntent(result.text);
    if (parsed.parseError) {
      console.warn("[assistant] parse failure", { model: result.model });
    }

    res.status(200).json({
      reply: parsed.reply,
      actionIntent: parsed.actionIntent,
      meta: {
        model: result.model,
        latencyMs: result.latencyMs,
        contextTracksCount: context.topTracks.length,
      },
    });
  } catch (error) {
    const message = String((error as Error)?.message ?? "").toLowerCase();
    const code = (error as { code?: string }).code;
    if ((error as { code?: string }).code === "MISSING_API_KEY" || message.includes("api key") || message.includes("403")) {
      return res.status(503).json({
        code: "AI_SERVICE_UNAVAILABLE",
        message: "AI Assistant is not configured correctly. Please contact support.",
      });
    }
    if ((error as Error).name === "GeminiError") {
      if (code === "PROVIDER_TIMEOUT") {
        console.error("[assistant] provider timeout");
        return res.status(503).json({
          code: "AI_SERVICE_UNAVAILABLE",
          message: "AI Assistant is temporarily busy. Please try again shortly.",
        });
      }
      if (code === "GEMINI_TEMPORARY_UNAVAILABLE") {
        console.error("[assistant] provider temporary unavailable");
        return res.status(503).json({
          code: "AI_SERVICE_UNAVAILABLE",
          message: "AI Assistant is temporarily busy. Please try again shortly.",
        });
      }
      if (code === "GEMINI_QUOTA_EXHAUSTED") {
        console.error("[assistant] provider quota exhausted");
        return res.status(503).json({
          code: "AI_SERVICE_UNAVAILABLE",
          message: "AI Assistant quota is currently exhausted. Please try again later.",
        });
      }
      if (code === "GEMINI_INVALID_MODEL") {
        console.error("[assistant] invalid model configuration");
        return res.status(503).json({
          code: "AI_SERVICE_UNAVAILABLE",
          message: "AI Assistant is not configured correctly. Please contact support.",
        });
      }
      if (code === "GEMINI_EMPTY_RESPONSE") {
        console.error("[assistant] empty provider response");
        return res.status(503).json({
          code: "AI_SERVICE_UNAVAILABLE",
          message: "AI Assistant is temporarily busy. Please try again shortly.",
        });
      }
      console.error("[assistant] provider failure", { code });
      return res.status(503).json({
        code: "AI_SERVICE_UNAVAILABLE",
        message: "AI Assistant is not configured correctly. Please contact support.",
      });
    }
    if ((error as Error).name === "AssistantContextError") {
      sendError(res, ErrorCatalog.ASSISTANT_CONTEXT_BUILD_FAILED);
      return;
    }

    console.error("[assistant] unexpected error", error);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Assistant failed. Please try again." });
  }
});

assistantRouter.get("/context", async (req, res) => {
  try {
    const context = await buildLibraryContext(req.userId!);
    if (req.query.pretty === "1") {
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify(context, null, 2));
      return;
    }
    res.status(200).json(context);
  } catch {
    sendError(res, ErrorCatalog.ASSISTANT_CONTEXT_BUILD_FAILED);
  }
});

export default assistantRouter;
