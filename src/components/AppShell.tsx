import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  HandCoins,
  FlaskConical,
  ReceiptText,
  Sparkles,
  LogOut,
  Menu,
  Leaf,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard, adminOnly: false },
  { to: "/pdv", label: "PDV", icon: ShoppingCart, adminOnly: false },
  { to: "/vendas", label: "Vendas", icon: ReceiptText, adminOnly: false },
  { to: "/produtos", label: "Produtos", icon: Package, adminOnly: true },
  { to: "/estoque", label: "Estoque", icon: Boxes, adminOnly: false },
  { to: "/producao", label: "Produção", icon: FlaskConical, adminOnly: true },
  { to: "/clientes", label: "Clientes", icon: Users, adminOnly: false },
  { to: "/dividas", label: "Dívidas", icon: HandCoins, adminOnly: false },
  { to: "/assistente", label: "Assistente IA", icon: Sparkles, adminOnly: true },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  adminOnly,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  adminOnly?: boolean;
  children: ReactNode;
}) {
  const { user, loading, role, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        A carregar…
      </div>
    );
  }

  const items = NAV.filter((n) => !n.adminOnly || isAdmin);
  const blocked = adminOnly && role !== null && !isAdmin;

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r bg-sidebar p-4 transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-8 flex items-center gap-2 px-2">
          <span className="gradient-fresh flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <Leaf className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight">BK BUSINESS</p>
            <p className="text-[11px] text-muted-foreground">Gestão inteligente</p>
          </div>
        </div>

        <nav className="space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{
                className: "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="absolute inset-x-4 bottom-4">
          <div className="mb-2 flex items-center gap-2 px-3">
            <Badge variant={isAdmin ? "default" : "secondary"} className="text-[10px]">
              {isAdmin ? "Dono" : "Funcionário"}
            </Badge>
          </div>
          <p className="mb-2 truncate px-3 text-xs text-muted-foreground">{user.email}</p>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => signOut()}>
            <LogOut className="size-4" />
            Terminar sessão
          </Button>
        </div>
      </aside>

      {open ? (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background/85 px-4 py-4 backdrop-blur md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          {!blocked ? actions : null}
        </header>
        <div className="p-4 md:p-8">
          {blocked ? (
            <div className="mx-auto max-w-md rounded-xl border p-8 text-center">
              <p className="font-semibold">Área reservada ao dono</p>
              <p className="mt-2 text-sm text-muted-foreground">
                O seu perfil de funcionário não tem acesso a esta secção.
              </p>
              <Button className="mt-4" asChild>
                <Link to="/pdv">Ir para o PDV</Link>
              </Button>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}
