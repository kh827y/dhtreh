"use client";

import { MiniappAuthProvider } from "../lib/MiniappAuthContext";
import { FeedbackManager } from "../components/FeedbackManager";
import { type ReactNode } from "react";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <MiniappAuthProvider defaultMerchant="">
      {children}
      <FeedbackManager />
    </MiniappAuthProvider>
  );
}
