"use client";

import React from "react";
import { Loader2 } from "lucide-react";

type PageLoaderProps = {
  message?: string;
};

export default function PageLoader({
  message = "Загружаем данные...",
}: PageLoaderProps) {
  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm min-h-[220px] flex items-center justify-center text-gray-600">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <Loader2 size={16} className="animate-spin" />
          <span>{message}</span>
        </div>
      </div>
    </div>
  );
}
