import { Suspense } from "react";
import VerifyEmailClient from "./VerifyEmailClient";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[70vh] items-center justify-center px-4">Verifying your email…</div>}>
      <VerifyEmailClient />
    </Suspense>
  );
}
