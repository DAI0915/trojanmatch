import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverFlags } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { signInAction } from "../actions";
import { AuthForm } from "../auth-form";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  const confirmError = sp.error === "confirm_failed";
  const { PUBLIC_SIGNUP_ENABLED } = serverFlags();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your TrojanMatch account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {confirmError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            That confirmation link is invalid or expired.
          </p>
        )}
        <AuthForm
          action={signInAction}
          submitLabel="Sign in"
          hidden={{ next }}
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          {PUBLIC_SIGNUP_ENABLED ? (
            <Link href="/sign-up" className="underline-offset-4 hover:underline">
              Create an account
            </Link>
          ) : (
            <span>Public sign-up opens soon.</span>
          )}
          <Link href="/demo" className="underline-offset-4 hover:underline">
            Try Demo Mode
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
