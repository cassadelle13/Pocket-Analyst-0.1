import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <HomeClient />
    </Suspense>
  );
}
