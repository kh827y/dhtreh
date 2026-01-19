"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useMiniappAuth } from "./useMiniapp";

type MiniappAuthValue = ReturnType<typeof useMiniappAuth>;

const MiniappAuthContext = createContext<MiniappAuthValue | null>(null);

type MiniappAuthProviderProps = {
  defaultMerchant: string;
  children: ReactNode;
};

export function MiniappAuthProvider({ defaultMerchant, children }: MiniappAuthProviderProps) {
  const value = useMiniappAuth(defaultMerchant);
  return <MiniappAuthContext.Provider value={value}>{children}</MiniappAuthContext.Provider>;
}

export function useMiniappAuthContext(): MiniappAuthValue {
  const ctx = useContext(MiniappAuthContext);
  if (!ctx) {
    throw new Error("useMiniappAuthContext must be used within MiniappAuthProvider");
  }
  return ctx;
}
