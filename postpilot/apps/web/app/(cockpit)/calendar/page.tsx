import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingPanel } from "@/components/ui";
import { CalendarClient } from "./calendar-client";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <Suspense fallback={<LoadingPanel label="Loading calendar…" />}><CalendarClient /></Suspense>;
}

