import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AuthLayout } from "./AuthLayout";
import { AuthField, AuthErrorNotice, AuthSubmit } from "./AuthControls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { phoneSchema } from "@/features/auth/validation";
import { useAuthActions } from "@/hooks/use-auth-actions";
import { businessAuth } from "@/services/business-auth";

export function VerificationScreen({ redirect }: { redirect: string }) {
  const initial = businessAuth.getPending();
  const [phoneNumber, setPhoneNumber] = useState(initial?.phoneNumber ?? "");
  const [phoneError, setPhoneError] = useState<string>();
  const [otpCode, setOtpCode] = useState("");
  const [resendAt, setResendAt] = useState(initial?.resendAt ?? 0);
  const [now, setNow] = useState(Date.now());
  const [codeError, setCodeError] = useState<string>();
  const { verify, resend } = useAuthActions();
  const pending = verify.isPending || resend.isPending;
  const seconds = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  function validatedPhone() {
    const parsed = phoneSchema.safeParse(phoneNumber);
    setPhoneError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    return parsed.success ? parsed.data : null;
  }
  return (
    <AuthLayout
      title="Verify your phone"
      description={
        initial ? (
          <>
            Enter the six-digit SMS code sent to{" "}
            <span className="font-semibold text-foreground">{initial.phoneNumber}</span>.
          </>
        ) : (
          "Enter your registered phone number and SMS code. You can request a new code below."
        )
      }
      footer={
        <>
          Already verified?{" "}
          <Link
            to="/auth/login"
            search={{ redirect }}
            className="font-semibold text-primary hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          const phone = validatedPhone();
          if (!/^\d{6}$/.test(otpCode)) {
            setCodeError("Enter all 6 digits from your SMS.");
            return;
          }
          if (!phone) return;
          setCodeError(undefined);
          resend.reset();
          try {
            await verify.mutateAsync({ phoneNumber: phone, otpCode });
          } catch {
            /* Inline error. */
          }
        }}
      >
        <fieldset disabled={pending} className="space-y-5">
          {!initial && (
            <AuthField
              id="verify-phone"
              label="Registered phone number"
              type="tel"
              autoComplete="tel"
              placeholder="0772 123 456"
              value={phoneNumber}
              error={phoneError}
              onChange={(event) => {
                setPhoneNumber(event.target.value);
                verify.reset();
                resend.reset();
              }}
            />
          )}
          <div className="space-y-3">
            <Label htmlFor="otp">Verification code</Label>
            <InputOTP
              id="otp"
              maxLength={6}
              pattern="^[0-9]*$"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(value) => {
                setOtpCode(value);
                setCodeError(undefined);
                verify.reset();
              }}
              aria-invalid={Boolean(codeError)}
              aria-describedby="otp-help"
              containerClassName="justify-center"
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot key={index} index={index} className="h-12 w-11 text-lg sm:w-12" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p
              id="otp-help"
              className={codeError ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {codeError ?? "You can paste the code directly from your SMS."}
            </p>
          </div>
          <AuthErrorNotice error={verify.error || resend.error} />
          <AuthSubmit pending={verify.isPending} disabled={resend.isPending}>
            {verify.isPending ? "Verifying…" : "Verify phone number"}
          </AuthSubmit>
        </fieldset>
      </form>
      <div className="mt-5 text-center text-sm text-muted-foreground">
        <p>Didn't receive a code?</p>
        <Button
          type="button"
          variant="link"
          disabled={pending || seconds > 0}
          onClick={async () => {
            const phone = validatedPhone();
            if (!phone) return;
            verify.reset();
            try {
              await resend.mutateAsync(phone);
              setOtpCode("");
              toast.success("A new verification code has been sent.");
            } catch {
              /* Inline error and server cooldown. */
            } finally {
              setResendAt(businessAuth.getPending()?.resendAt ?? 0);
              setNow(Date.now());
            }
          }}
        >
          {resend.isPending
            ? "Sending code…"
            : seconds
              ? `Resend code in ${seconds}s`
              : "Resend code"}
        </Button>
        {initial && (
          <p className="mt-2 text-xs">
            Wrong number?{" "}
            <Link
              to="/auth/register"
              search={{ redirect }}
              className="text-primary hover:underline"
            >
              Use a different number
            </Link>
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
