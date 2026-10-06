"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { serveStudioSession } from "@/features/auth/studio-session";

export default function AuthBridge() {
  useEffect(() => {
    const sb = supabase();
    if (sb) return serveStudioSession(sb);
  }, []);
  return null;
}
