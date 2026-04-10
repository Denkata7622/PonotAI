import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
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

assistantRouter.use(requireAuth);

assistantRouter.post("/", async (req, res) => {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return res.status(503).json({
      code: "AI_SERVICE_UNAVAILABLE",
      message: "AI Assistant is not configured. The administrator needs to add GEMINI_API_KEY to the server environment variables. Get a free key at https://aistudio.google.com/app/apikey",
    });
  }

  const userId = req.userId!;
  if (!enforceUserRateLimit(userId)) {
    sendError(res, ErrorCatalog.RATE_LIMIT_EXCEEDED, { limit: 20, windowSeconds: 60 });
    return;
  }

  const body = req.body as { message?: unknown; conversation?: unknown };

  if (typeof body.message !== "string" || body.message.length < 1 || body.message.length > 2000) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "message", min: 1, max: 2000 });
    return;
  }

  if (!validateConversation(body.conversation)) {
    sendError(res, ErrorCatalog.VALIDATION_ERROR, { field: "conversation", maxItems: 15 });
    return;
  }

  const message = stripActionTags(body.message);
  const conversation = body.conversation.map((item) => ({
    role: item.role,
    content: stripActionTags(item.content),
  }));
  const geminiHistory: GeminiHistoryMessage[] = conversation.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return res.status(503).json({
      code: "AI_SERVICE_UNAVAILABLE",
      message: "AI Assistant is not configured. Add GEMINI_API_KEY to the backend environment variables.",
    });
  }

  try {
    const context = await buildLibraryContext(userId, {
      currentTheme: req.headers["x-trackly-theme"] as "light" | "dark" | "system" | undefined,
      currentLanguage: req.headers["x-trackly-language"] as "en" | "bg" | undefined,
      currentQueue: typeof req.headers["x-trackly-queue"] === "string"
        ? req.headers["x-trackly-queue"].split("|").filter(Boolean).slice(0, 10)
        : [],
    });
    if (context.topTracks.length === 0) {
      res.status(200).json({
        reply: "Your library is empty. Recognize and save some songs first, then I can give you personalized recommendations.",
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
    console.error("[assistant] Full error:", error);
    console.error("[assistant] Error message:", error instanceof Error ? error.message : String(error));
    console.error("[assistant] Error stack:", error instanceof Error ? error.stack : "no stack");

    const message = String((error as Error)?.message ?? "").toLowerCase();
    if ((error as Error).name === "GeminiError") {
      if (message.includes("unavailable") || message.includes("overloaded") || message.includes("503")) {
        return res.status(503).json({
          code: "AI_SERVICE_UNAVAILABLE",
          message: "AI Assistant is temporarily busy. Please try again in a few seconds.",
        });
      }
      return res.status(503).json({
        code: "AI_SERVICE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Assistant failed. Please try again.",
      });
    }
    if ((error as { code?: string }).code === "MISSING_API_KEY" || message.includes("api key") || message.includes("403")) {
      return res.status(503).json({
        code: "AI_SERVICE_UNAVAILABLE",
        message: "AI Assistant is not configured. Add GEMINI_API_KEY to the backend environment variables.",
      });
    }
    if ((error as Error).name === "AssistantContextError") {
      sendError(res, ErrorCatalog.ASSISTANT_CONTEXT_BUILD_FAILED);
      return;
    }

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
