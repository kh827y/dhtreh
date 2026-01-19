"use client";

import { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & { rounded?: string };

export default function Skeleton({ className = "", rounded = "rounded-md", ...rest }: Props) {
  return <div className={`animate-pulse bg-[#1a2540] ${rounded} ${className}`} {...rest} />;
}
