"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv, serverFlags } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; notice?: string };

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email first. Check your inbox for the confirmation link." };
    }
    // Generic message: do not reveal whether the account exists.
    return { error: "Incorrect email or password." };
  }
  redirect(safeNextPath(parsed.data.next));
}

const signUpSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  email: z.email().max(254),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  // Server-side gate: the UI hides the form too, but never trust the UI.
  if (!serverFlags().PUBLIC_SIGNUP_ENABLED) {
    return { error: "Public sign-up is not open yet. Try Demo Mode instead." };
  }
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/confirm?next=/spaces`,
    },
  });
  if (error) {
    if (error.message.includes("EMAIL_DOMAIN_NOT_ALLOWED")) {
      return { error: "Sign-up is limited to allowed email domains." };
    }
    return { error: "Could not create the account. Try again later." };
  }
  // Same notice whether or not the email already exists (no account enumeration).
  return { notice: "Check your email for a confirmation link to finish creating your account." };
}
