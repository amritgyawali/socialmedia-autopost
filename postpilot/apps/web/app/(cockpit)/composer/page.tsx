import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingPanel } from "@/components/ui";
import { ComposerClient } from "./composer-client";

export const metadata: Metadata = { title: "Composer" };

export default function ComposerPage() {
  return <Suspense fallback={<LoadingPanel label="Opening Composer…" />}><ComposerClient /></Suspense>;
}

