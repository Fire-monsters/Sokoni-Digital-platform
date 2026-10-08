import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingBasket,
  Store,
  Truck,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { resetDemo, getProfile } from "@/services/api";
import { useDemoQuery } from "@/hooks/use-demo";
import { Brand } from "@/components/Brand";
import { useAuthActions } from "@/hooks/use-auth-actions";
import { authErrorMessage } from "@/services/business-auth";

const NAV = [
  { group: null, items: [{ to: "/", label: "Overview", icon: LayoutDashboard }] },
  {
    group: "Buy",
    items: [
      { to: "/buy/catalogue", label: "Wholesale catalogue", icon: ShoppingBasket },
      { to: "/buy/orders", label: "Purchase orders", icon: Truck },
    ],
  },
  { group: "Shared stock", items: [{ to: "/inventory", label: "Inventory", icon: Boxes }] },
  {
    group: "Sell",
    items: [
      { to: "/sell/listings", label: "Consumer listings", icon: Store },
      { to: "/sell/orders", label: "Consumer orders", icon: ClipboardList },
    ],
  },
  {
    group: "Business",
    items: [
      { to: "/finance", label: "Finance", icon: Receipt },
      { to: "/reports", label: "Reports", icon: BarChart3 },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map((g, i) => (
        <div key={i}>
          {g.group && (
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-widest text-sidebar-muted">
              {g.group}
            </p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.to}>
                <Link
                  to={it.to}
                  onClick={onNavigate}
                  activeOptions={{ exact: it.to === "/" }}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/90 transition hover:bg-sidebar-accent data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-accent-foreground"
                >
                  <it.icon className="h-4 w-4" aria-hidden /> {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ResetDemo() {
  const qc = useQueryClient();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw className="h-4 w-4" />{" "}
          <span className="hidden sm:inline">Reset demo data</span>
          <span className="sm:hidden">Reset</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
          <AlertDialogDescription>
            All purchase orders, stock changes, listings and consumer orders you created in this
            browser will be replaced with the original sample data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              await resetDemo();
              await qc.invalidateQueries();
              toast.success("Demo data reset");
            }}
          >
            Reset data
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { logout } = useAuthActions();
  const profile = useDemoQuery(["profile"], getProfile);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-card focus:p-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto bg-sidebar py-5 px-2 lg:flex">
        <Brand inverse />
        <NavList />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-none bg-sidebar p-4">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex flex-col gap-6">
            <Brand inverse />
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {profile.data?.name ?? "Loading business…"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile.data
                ? `${profile.data.location}, ${profile.data.district} · East Africa Time`
                : "\u00a0"}
            </p>
          </div>
          <span
            className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground"
            title="Data is stored only in this browser"
          >
            Demo mode
          </span>
          <ResetDemo />
          <Button
            variant="ghost"
            size="sm"
            disabled={logout.isPending}
            onClick={async () => {
              try {
                await logout.mutateAsync();
              } catch (error) {
                toast.error(authErrorMessage(error));
              }
            }}
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">
              {logout.isPending ? "Logging out…" : "Log out"}
            </span>
          </Button>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
