"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/client-auth";
import { BASE } from "@/lib/api";
import AuthPage from "@/components/auth-shell";

export default function Login() {
  const supabase = getSupabase();
  const router = useRouter();
  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(BASE + "/");
    });
  }, [supabase, router]);
  return <AuthPage mode="entrar" />;
}
