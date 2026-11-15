import { connection } from "next/server";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { serverFlags } from "@/lib/env";
import { signUpAction } from "../actions";
import { AuthForm } from "../auth-form";

export default async function SignUpPage() {
  await connection(); // flags are read per request, not frozen at build
  const { PUBLIC_SIGNUP_ENABLED } = serverFlags();
  if (!PUBLIC_SIGNUP_ENABLED) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign-up isn&apos;t open yet</CardTitle>
          <CardDescription>
            Public accounts open once email delivery is configured. You can explore every flow in
            Demo Mode with clearly labeled synthetic participants.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Link href="/demo" className={buttonVariants({ size: "lg" })}>
            Try Demo Mode
          </Link>
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
            I already have an account
          </Link>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>We&apos;ll email you a confirmation link.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <AuthForm
          action={signUpAction}
          submitLabel="Create account"
          fields={[
            { name: "displayName", label: "Display name", type: "text", autoComplete: "name" },
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password (10+ characters)", type: "password", autoComplete: "new-password" },
          ]}
        />
        <Link href="/sign-in" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Already have an account? Sign in
        </Link>
      </CardContent>
    </Card>
  );
}
