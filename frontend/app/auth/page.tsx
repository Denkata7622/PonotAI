import { Suspense } from "react";
import AuthPage from "../../src/screens/AuthPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex min-h-[80vh] items-center justify-center">Loading…</div>}>
      <AuthPage />
    </Suspense>
  );
}