"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

type DownloadState = "idle" | "loading" | "success" | "error";

type DownloadPayload = {
  filePath?: string;
  message?: string;
  error?: string;
};

export default function DownloadClient() {
  const searchParams = useSearchParams();
  const prefillQuery = useMemo(() => searchParams.get("query")?.trim() ?? "", [searchParams]);
  const autoTriggeredRef = useRef(false);

  const [songName, setSongName] = useState(prefillQuery);
  const [state, setState] = useState<DownloadState>("idle");
  const [successPath, setSuccessPath] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setSongName(prefillQuery);
  }, [prefillQuery]);

  async function runDownload(nameOverride?: string) {
    const query = (nameOverride ?? songName).trim();
    if (!query) {
      setState("error");
      setErrorMessage("Please enter a song name.");
      setSuccessPath("");
      return;
    }

    setState("loading");
    setErrorMessage("");
    setSuccessPath("");

    try {
      const response = await fetch("/api/music/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songName: query }),
      });

      const payload = (await response.json().catch(() => ({}))) as DownloadPayload;

      if (!response.ok) {
        setState("error");
        setErrorMessage(payload.message || payload.error || "Download failed. Please try again.");
        return;
      }

      setState("success");
      setSuccessPath(payload.filePath || "Download completed successfully.");
    } catch {
      setState("error");
      setErrorMessage("Network error while contacting downloader service.");
    }
  }

  useEffect(() => {
    if (!prefillQuery || autoTriggeredRef.current) return;
    autoTriggeredRef.current = true;
    void runDownload(prefillQuery);
  }, [prefillQuery]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Card className="space-y-5 rounded-2xl p-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Music Downloader</h1>
          <p className="mt-1 text-sm text-text-muted">Download a song by name as MP3.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="songName" className="text-sm text-text-muted">Song name</label>
          <Input
            id="songName"
            value={songName}
            onChange={(event) => setSongName(event.target.value)}
            placeholder="e.g. Blinding Lights The Weeknd"
            disabled={state === "loading"}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void runDownload()} disabled={state === "loading"}>
            {state === "loading" ? "Downloading..." : "Download"}
          </Button>
          {state === "loading" && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-text-primary" />
              <span>Searching and converting...</span>
            </div>
          )}
        </div>

        {state === "success" && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Download completed. File: {successPath}
          </div>
        )}

        {state === "error" && (
          <div className="rounded-xl border border-danger bg-surface-raised px-4 py-3 text-sm text-danger">
            {errorMessage}
          </div>
        )}
      </Card>
    </main>
  );
}
