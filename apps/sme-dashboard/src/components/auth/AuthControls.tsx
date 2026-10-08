import { useState, type ComponentProps } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, type ButtonProps } from "@/components/ui/button";
import { authErrorMessage } from "@/services/business-auth";

export function AuthField({
  label,
  error,
  hint,
  ...props
}: ComponentProps<typeof Input> & { label: string; error?: string; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>{label}</Label>
      <Input
        {...props}
        className="h-11"
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${props.id}-help` : undefined}
      />
      {(error || hint) && (
        <p
          id={`${props.id}-help`}
          className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  error,
  hint,
  ...props
}: ComponentProps<typeof Input> & { error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={props.id}>Password</Label>
      <div className="relative">
        <Input
          {...props}
          type={visible ? "text" : "password"}
          className="h-11 pr-12"
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${props.id}-help` : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      {(error || hint) && (
        <p
          id={`${props.id}-help`}
          className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function AuthErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/20 bg-danger-soft p-3 text-sm text-destructive"
    >
      {authErrorMessage(error)}
    </p>
  );
}

export function AuthSubmit({ pending, children, ...props }: ButtonProps & { pending: boolean }) {
  return (
    <Button
      {...props}
      type="submit"
      size="lg"
      className="h-11 w-full"
      disabled={pending || props.disabled}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
