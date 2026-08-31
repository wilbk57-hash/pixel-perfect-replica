import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir para o painel
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo correu mal. Tente novamente ou volte ao painel.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o painel
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BK BUSINESS — Gestão, PDV e Produção" },
      {
        name: "description",
        content:
          "Sistema de gestão empresarial: vendas, estoque, produção, clientes e inteligência de negócio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0f1f4d" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "BK BUSINESS" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var KEY = 'bk-chunk-reload';
                function isChunkError(msg) {
                  return typeof msg === 'string' && (
                    msg.indexOf('Failed to fetch dynamically imported module') !== -1 ||
                    msg.indexOf('error loading dynamically imported module') !== -1 ||
                    msg.indexOf('Importing a module script failed') !== -1
                  );
                }
                async function recover() {
                  if (sessionStorage.getItem(KEY)) return;
                  sessionStorage.setItem(KEY, '1');
                  try {
                    if ('serviceWorker' in navigator) {
                      var regs = await navigator.serviceWorker.getRegistrations();
                      await Promise.all(regs.map(function (r) { return r.unregister(); }));
                    }
                    if (window.caches) {
                      var names = await caches.keys();
                      await Promise.all(names.map(function (n) { return caches.delete(n); }));
                    }
                  } catch (e) {}
                  location.reload();
                }
                window.addEventListener('error', function (e) {
                  if (isChunkError(e && e.message)) recover();
                });
                window.addEventListener('unhandledrejection', function (e) {
                  var r = e && e.reason;
                  if (isChunkError(r && r.message ? r.message : String(r))) recover();
                });
                window.addEventListener('load', function () {
                  setTimeout(function () { sessionStorage.removeItem(KEY); }, 5000);
                });
              })();

              if ('serviceWorker' in navigator) {
                window.addEventListener('load', async () => {
                  if (${JSON.stringify(import.meta.env.PROD)}) {
                    navigator.serviceWorker.register('/sw.js').catch(() => {});
                    return;
                  }

                  const registrations = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(registrations.map((registration) => registration.unregister()));
                  const cacheNames = await caches.keys();
                  await Promise.all(
                    cacheNames
                      .filter((name) => name.startsWith('bk-business-shell-'))
                      .map((name) => caches.delete(name)),
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Toaster richColors position="top-center" />
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
