"use client";

import { useEffect } from "react";
import { ErrorPanel } from "@/components/ui";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return <main className="center-page"><ErrorPanel message="The cockpit hit an unexpected error. Your engine data was not changed." retry={reset} /></main>;
}

