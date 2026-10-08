import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground">
        <Sprout className="h-5 w-5" aria-hidden />
      </span>
      <div className="leading-tight">
        <p
          className={cn(
            "font-display text-base font-bold",
            inverse ? "text-sidebar-foreground" : "text-foreground",
          )}
        >
          Sokoni Digital
        </p>
        <p className={cn("text-xs", inverse ? "text-sidebar-muted" : "text-muted-foreground")}>
          SME workspace
        </p>
      </div>
    </div>
  );
}
