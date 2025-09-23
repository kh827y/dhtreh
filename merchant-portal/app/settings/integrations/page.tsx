"use client";
export default function SettingsIntegrationsWrapper(){
  if (typeof window !== 'undefined') window.location.href = '/integrations';
  return null;
}
