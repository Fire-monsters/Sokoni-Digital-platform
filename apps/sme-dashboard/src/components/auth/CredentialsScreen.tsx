import { Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "./AuthLayout";
import { AuthErrorNotice, AuthField, AuthSubmit, PasswordField } from "./AuthControls";
import { credentialsSchema } from "@/features/auth/validation";
import { useAuthActions } from "@/hooks/use-auth-actions";
import { useAuthRetryCooldown } from "@/hooks/use-auth-retry-cooldown";

export function CredentialsScreen({
  mode,
  redirect,
}: {
  mode: "login" | "register";
  redirect: string;
}) {
  const registering = mode === "register";
  const actions = useAuthActions();
  const mutation = registering ? actions.register : actions.login;
  const retrySeconds = useAuthRetryCooldown(mutation.error);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ phoneNumber: string; password: string }>({
    resolver: zodResolver(credentialsSchema(registering)),
    defaultValues: { phoneNumber: "", password: "" },
  });
  return (
    <AuthLayout
      title={registering ? "Create your account" : "Welcome back"}
      description={
        registering
          ? "Get started with your phone number. We'll send you a code to verify it."
          : "Log in to your Sokoni Digital SME workspace."
      }
      footer={
        <>
          {" "}
          {registering ? "Already have an account?" : "New to Sokoni Digital?"}{" "}
          <Link
            to={registering ? "/auth/login" : "/auth/register"}
            search={{ redirect }}
            className="font-semibold text-primary hover:underline"
          >
            {registering ? "Log in" : "Create an account"}
          </Link>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={handleSubmit(async (input) => {
          if (mutation.isPending || retrySeconds > 0) return;
          try {
            await mutation.mutateAsync(input);
            if (registering) await navigate({ to: "/auth/verify", search: { redirect } });
            // Successful login is redirected by the auth boundary.
          } catch {
            /* The mutation exposes the error below. */
          }
        })}
      >
        <fieldset disabled={mutation.isPending} className="space-y-5">
          <AuthField
            id="phoneNumber"
            label="Phone number"
            type="tel"
            autoComplete="tel"
            placeholder="0772 123 456"
            hint="Use your Ugandan number, starting with 0 or +256."
            error={errors.phoneNumber?.message}
            {...register("phoneNumber")}
          />
          <PasswordField
            id="password"
            autoComplete={registering ? "new-password" : "current-password"}
            hint={
              registering
                ? "At least 8 characters, with uppercase, lowercase and a number."
                : undefined
            }
            error={errors.password?.message}
            {...register("password")}
          />
          <AuthErrorNotice error={mutation.error} />
          <AuthSubmit pending={mutation.isPending} disabled={retrySeconds > 0}>
            {retrySeconds > 0
              ? `Try again in ${retrySeconds}s`
              : mutation.isPending
                ? registering
                  ? "Creating account…"
                  : "Logging in…"
                : registering
                  ? "Create account"
                  : "Log in"}
          </AuthSubmit>
        </fieldset>
      </form>
      {!registering && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Still need to verify your phone?{" "}
          <Link
            to="/auth/verify"
            search={{ redirect }}
            className="font-medium text-primary hover:underline"
          >
            Enter a verification code
          </Link>
        </p>
      )}
      {registering && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Phone verification secures your account. Business approval is handled separately.
        </p>
      )}
    </AuthLayout>
  );
}
