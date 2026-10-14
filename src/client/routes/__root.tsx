import { createRootRoute, Outlet } from "@tanstack/react-router"
import { ErrorPage, NotFoundPage } from "@/shell/status-pages"

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
})
