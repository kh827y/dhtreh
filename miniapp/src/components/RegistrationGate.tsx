"use client";

import { type ReactNode } from "react";
import { type AuthStatus } from "../lib/useMiniapp";

type RegistrationGateProps = {
  status: AuthStatus;
  teleOnboarded: boolean | null;
  localOnboarded: boolean;
  onboardingView: ReactNode;
  dashboardView: ReactNode;
  splashView: ReactNode;
};

export function RegistrationGate({
  status,
  teleOnboarded,
  localOnboarded,
  onboardingView,
  dashboardView,
  splashView,
}: RegistrationGateProps) {
  const canTrustLocal = localOnboarded && teleOnboarded !== false;
  const mustOnboard = teleOnboarded === false && !localOnboarded;
  if (mustOnboard) {
    return <>{onboardingView}</>;
  }

  if (canTrustLocal || teleOnboarded) {
    return <>{dashboardView}</>;
  }

  if (status === "authenticating") {
    return <>{splashView}</>;
  }

  if (status === "failed") {
    return <>{onboardingView}</>;
  }

  return <>{splashView}</>;
}
