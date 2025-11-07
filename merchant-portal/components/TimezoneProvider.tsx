"use client";

import React from "react";

export type PortalTimezone = {
  code: string;
  label: string;
  city: string;
  description: string;
  mskOffset: number;
  utcOffsetMinutes: number;
  iana: string;
};

type ContextValue = {
  timezone: PortalTimezone;
  options: PortalTimezone[];
  setTimezone: (value: PortalTimezone) => void;
};

const TimezoneContext = React.createContext<ContextValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  timezone: PortalTimezone;
  options: PortalTimezone[];
};

export default function TimezoneProvider({ children, timezone, options }: ProviderProps) {
  const [current, setCurrent] = React.useState<PortalTimezone>(timezone);
  const memoOptions = React.useMemo(() => options, [options]);

  const value = React.useMemo<ContextValue>(
    () => ({
      timezone: current,
      options: memoOptions,
      setTimezone: setCurrent,
    }),
    [current, memoOptions],
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

export function useTimezone() {
  const ctx = React.useContext(TimezoneContext);
  if (!ctx) {
    throw new Error("TimezoneProvider is missing in the component tree");
  }
  return ctx.timezone;
}

export function useTimezoneOptions() {
  const ctx = React.useContext(TimezoneContext);
  if (!ctx) {
    throw new Error("TimezoneProvider is missing in the component tree");
  }
  return ctx.options;
}

export function useTimezoneUpdater() {
  const ctx = React.useContext(TimezoneContext);
  if (!ctx) {
    throw new Error("TimezoneProvider is missing in the component tree");
  }
  return ctx.setTimezone;
}
