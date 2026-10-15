"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function AppTemplate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
