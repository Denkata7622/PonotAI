import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { ErrorCatalog, sendError } from "../errors/errorCatalog";
import { buildLibraryContext } from "../services/assistant/contextBuilder";
import { buildSystemPrompt } from "../services/assistant/prompt";
import { generateAssistantReply } from "../services/assistant/geminiClient";
import { parseActionIntent } from "../services/assistant/actionParser";
import type { GeminiMessage } from "../types/assistant";

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

  try {
    const context = await buildLibraryContext(userId);
    const systemPrompt = buildSystemPrompt(context);
    const result = await generateAssistantReply(systemPrompt, conversation, message);
    const parsed = parseActionIntent(result.text);

    res.status(200).json({
      reply: parsed.reply,
      actionIntent: parsed.actionIntent,
      meta: {
        model: "gemini-1.5-flash",
        latencyMs: result.latencyMs,
        contextTracksCount: context.topTracks.length,
      },
    });
  } catch (error) {
    const messageText = (error as Error).message || "Unknown error";
    if ((error as Error).name === "GeminiError" || messageText.includes("Gemini")) {
      sendError(res, ErrorCatalog.AI_SERVICE_UNAVAILABLE);
      return;
    }

    sendError(res, ErrorCatalog.ASSISTANT_CONTEXT_BUILD_FAILED);
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
