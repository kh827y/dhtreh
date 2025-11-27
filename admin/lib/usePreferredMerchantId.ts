"use client";

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'admin:lastMerchantId';

export function usePreferredMerchantId(initial?: string) {
  const [merchantId, setMerchantId] = useState<string>(initial || '');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !merchantId) setMerchantId(stored);
  }, [merchantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (merchantId) localStorage.setItem(STORAGE_KEY, merchantId);
  }, [merchantId]);

  return { merchantId, setMerchantId };
}
