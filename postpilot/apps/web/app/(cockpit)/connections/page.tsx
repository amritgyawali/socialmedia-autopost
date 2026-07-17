import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingPanel } from "@/components/ui";
import { ConnectionsClient } from "./connections-client";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return <Suspense fallback={<LoadingPanel label="Checking connections…" />}><ConnectionsClient /></Suspense>;
}

