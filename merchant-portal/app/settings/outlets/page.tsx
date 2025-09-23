"use client";
export default function SettingsOutletsWrapper(){
  if (typeof window !== 'undefined') window.location.href = '/outlets';
  return null;
}
