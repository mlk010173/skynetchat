"use client";
import { useEffect } from "react";
import { getSupabase } from "@/lib/client-auth";
import { BASE } from "@/lib/api";
import AuthPage from "@/components/auth-shell";

export default function Login() {
  const supabase = getSupabase();
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) location.replace(BASE + "/");
    });
  }, [supabase]);
  return <AuthPage mode="entrar" />;
}
