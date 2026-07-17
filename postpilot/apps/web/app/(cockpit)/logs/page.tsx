import type { Metadata } from "next";
import { LogsClient } from "./logs-client";

export const metadata: Metadata = { title: "Publish logs" };

export default function LogsPage() {
  return <LogsClient />;
}

