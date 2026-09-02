import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Mantém os dados em cache por 24h — é o que permite ao Painel,
        // PDV, Estoque, etc. mostrarem os últimos dados conhecidos
        // mesmo depois de recarregar a página estando offline.
        gcTime: 1000 * 60 * 60 * 24,
      },
    },
  });

  if (typeof window !== "undefined") {
    const persister = createSyncStoragePersister({ storage: window.localStorage, key: "bk-business-query-cache" });
    persistQueryClient({
      queryClient,
      persister,
      maxAge: 1000 * 60 * 60 * 24,
      // Nunca persiste respostas com erro (ex: pedidos falhados por
      // estar offline), só dados válidos já recebidos do servidor.
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => query.state.status === "success",
      },
    });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
