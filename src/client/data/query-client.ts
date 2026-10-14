import { QueryClient } from "@tanstack/react-query"
import { ApiRequestError } from "@/data/error-handler"

/**
 * The client cache. Online-first: revalidate when the app regains focus or the network comes
 * back; never poll.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: false,
      // Retrying cannot fix an auth or validation failure.
      retry: (failures, error) =>
        !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) &&
        failures < 2,
    },
  },
})
