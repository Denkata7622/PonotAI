import { Router, type NextFunction, type Request, type Response } from "express";
import { findUserById, updateUser } from "../../db/authStore";
import { attachUserIfPresent, requireAuth } from "../../middlewares/auth.middleware";
import {
  buildPersonalizationRecommendations,
  normalizePersonalizationPatch,
  toPersonalizationPreferences,
} from "./personalization.service";
import { normalizeThemePresetId } from "./themePresetCatalog";

const personalizationRouter = Router();

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function validationResponse(
  res: Response,
  validation: { code: "INVALID_PERSONALIZATION_PATCH" | "INVALID_THEME_PRESET_ID"; message: string },
) {
  res.status(validation.code === "INVALID_THEME_PRESET_ID" ? 422 : 400).json({
    ok: false,
    code: validation.code,
    message: validation.message,
  });
}

personalizationRouter.get("/", attachUserIfPresent, asyncHandler(async (req, res) => {
  if (!req.userId) {
    res.status(200).json({
      ok: true,
      preferences: toPersonalizationPreferences(null),
      themePresetId: null,
      source: "local-default",
    });
    return;
  }

  const user = await findUserById(req.userId);
  if (!user) {
    res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "Authentication is required." });
    return;
  }

  const preferences = toPersonalizationPreferences(user);
  res.status(200).json({
    ok: true,
    preferences,
    themePresetId: preferences.themePresetId,
    source: preferences.themePresetId ? "database" : "local-default",
  });
}));

personalizationRouter.patch("/", requireAuth, asyncHandler(async (req, res) => {
  const user = await findUserById(req.userId!);
  if (!user) {
    res.status(401).json({ ok: false, code: "UNAUTHORIZED", message: "Authentication is required." });
    return;
  }

  const normalized = normalizePersonalizationPatch(req.body, toPersonalizationPreferences(user));
  if (!normalized.ok) {
    validationResponse(res, normalized);
    return;
  }

  const updated = await updateUser(user.id, {
    themePresetId: normalized.preferences.themePresetId,
  });
  if (!updated) {
    res.status(404).json({ ok: false, code: "USER_NOT_FOUND", message: "User was not found." });
    return;
  }

  const preferences = toPersonalizationPreferences(updated);
  res.status(200).json({
    ok: true,
    preferences,
    themePresetId: preferences.themePresetId,
    source: "database",
  });
}));

personalizationRouter.get("/recommendations", attachUserIfPresent, asyncHandler(async (req, res) => {
  const currentThemePresetId = typeof req.query.currentThemePresetId === "string"
    ? req.query.currentThemePresetId
    : undefined;
  const normalizedCurrentThemePresetId = normalizeThemePresetId(currentThemePresetId);

  if (currentThemePresetId !== undefined && !normalizedCurrentThemePresetId) {
    validationResponse(res, {
      code: "INVALID_THEME_PRESET_ID",
      message: "themePresetId must be one of the registered Turrex theme presets.",
    });
    return;
  }

  const user = req.userId ? await findUserById(req.userId) : null;
  const recommendations = buildPersonalizationRecommendations({ user, currentThemePresetId: normalizedCurrentThemePresetId });

  res.status(200).json({
    ok: true,
    recommendations,
  });
}));

export default personalizationRouter;
