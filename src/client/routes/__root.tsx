import {
  type ErrorComponentProps,
  createRootRoute,
  Outlet,
  useRouter,
} from "@tanstack/react-router"
import { useEffect } from "react"
import { isNetworkError } from "@/data/error-handler"
import { OfflineScreen, useOnline } from "@/shell/offline"
import { ErrorPage, NotFoundPage } from "@/shell/status-pages"

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: NotFoundPage,
  errorComponent: RootError,
})

/** The installed shell always opens; without a network it says so instead of failing. */
function Root() {
  const online = useOnline()
  const router = useRouter()
  // Back online: run the route loaders again so a page that failed offline recovers by itself.
  useEffect(() => {
    if (online) void router.invalidate()
  }, [online, router])
  return online ? <Outlet /> : <OfflineScreen />
}

function RootError(props: ErrorComponentProps) {
  return isNetworkError(props.error) ? <OfflineScreen /> : <ErrorPage {...props} />
}
