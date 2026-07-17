import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingPanel } from "@/components/ui";
import { TodayClient } from "./today-client";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <Suspense fallback={<LoadingPanel label="Loading today’s content…" />}><TodayClient /></Suspense>;
}
