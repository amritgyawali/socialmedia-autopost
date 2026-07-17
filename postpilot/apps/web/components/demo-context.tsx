"use client";

import { createContext, useContext, type ReactNode } from "react";

const DemoContext = createContext(false);

export function DemoProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <DemoContext.Provider value={enabled}>{children}</DemoContext.Provider>;
}

export function useDemoMode() {
  return useContext(DemoContext);
}

