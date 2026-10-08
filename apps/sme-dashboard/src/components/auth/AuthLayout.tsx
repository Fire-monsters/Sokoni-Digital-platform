import type { ReactNode } from "react";
import { Boxes, ShoppingBasket, Store } from "lucide-react";
import { Brand } from "@/components/Brand";

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-16">
        <Brand inverse />
        <div className="my-16 max-w-md">
          <span className="mb-6 inline-flex rounded-full bg-sidebar-accent px-3 py-1 text-xs font-semibold text-sidebar-foreground">
            Your business, connected
          </span>
          <h2 className="font-display text-5xl font-bold leading-tight">
            Grow your business.
            <br />
            <span className="text-accent">One workspace.</span>
          </h2>
          <p className="mt-5 leading-relaxed text-sidebar-muted">
            Buy wholesale produce, manage your stock and reach more customers with Sokoni Digital.
          </p>
          <div className="mt-10 space-y-5">
            {[
              {
                icon: ShoppingBasket,
                title: "Buy with confidence",
                text: "Discover wholesale produce for your shop.",
              },
              {
                icon: Boxes,
                title: "Keep stock in sync",
                text: "Manage buying and selling from one inventory.",
              },
              {
                icon: Store,
                title: "Reach your customers",
                text: "Bring your produce business online.",
              },
            ].map(({ icon: Icon, title: itemTitle, text }) => (
              <div className="flex gap-4" key={itemTitle}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sidebar-accent">
                  <Icon className="h-5 w-5 text-accent" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{itemTitle}</p>
                  <p className="mt-1 text-sm text-sidebar-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-sidebar-muted">Built for produce businesses in Uganda.</p>
      </aside>
      <main className="flex min-h-screen flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-3xl font-bold">{title}</h1>
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</div>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
        <p className="text-center text-xs text-muted-foreground">Sokoni Digital · SME workspace</p>
      </main>
    </div>
  );
}
