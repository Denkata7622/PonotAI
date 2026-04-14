import { validateEnvironment } from "./config/env";
import { resolveTrustProxySetting } from "./config/trustProxy";

async function startServer(): Promise<void> {
  validateEnvironment();
  const { refreshPersistenceHealth } = await import("./db/persistence");
  const persistence = await refreshPersistenceHealth();
  if (!persistence.connected) {
    throw new Error(`Runtime persistence check failed for mode ${persistence.mode}: ${persistence.lastError ?? "unknown error"}`);
  }
  const { default: app } = await import("./app");
  app.set("trust proxy", resolveTrustProxySetting());
  const port = Number(process.env.PORT || 4000);

  app.listen(port, () => {
    console.log(`PonotAI API running on http://localhost:${port}`);
  });
}

void startServer();
