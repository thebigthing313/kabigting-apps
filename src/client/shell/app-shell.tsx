import { getRouteApi, Link, Outlet } from "@tanstack/react-router"
import { ChevronsUpDownIcon, HouseIcon, KeyRoundIcon, LogOutIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { signOut } from "@/data/session"
import { APPS } from "@/shell/apps"
import { ThemeMenu } from "@/shell/theme-menu"

const appRoute = getRouteApi("/_app")

/** The Shell: a collapsible sidebar on desktop, a drawer on mobile, around the current App. */
export function AppShell() {
  return (
    <SidebarProvider>
      <ShellSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur supports-[height:100dvh]:h-[calc(3.5rem+env(safe-area-inset-top))]">
          <SidebarTrigger className="size-11" />
          <span className="font-medium">Kabigting Apps</span>
        </header>
        <main className="flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ShellSidebar() {
  const { session, apps } = appRoute.useRouteContext()
  const available = APPS.filter((app) => apps.includes(app.key))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <span className="flex size-8 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
                K
              </span>
              <span className="font-semibold">Kabigting Apps</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Apps</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Home"
                  render={<Link to="/" activeOptions={{ exact: true }} />}
                >
                  <HouseIcon />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {available.map((app) => (
                <SidebarMenuItem key={app.key}>
                  <SidebarMenuButton size="lg" tooltip={app.title} render={<Link to={app.to} />}>
                    <app.icon />
                    <span>{app.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <span className="flex size-8 items-center justify-center rounded-md bg-muted font-medium">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-col text-left text-sm leading-tight">
                  <span className="truncate font-medium">{session.user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {session.user.email}
                  </span>
                </span>
                <ChevronsUpDownIcon className="ml-auto" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-56">
                <DropdownMenuLabel>Account</DropdownMenuLabel>
                <ThemeMenu />
                <DropdownMenuItem className="min-h-11" render={<Link to="/change-password" />}>
                  <KeyRoundIcon />
                  Change password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-11" onClick={() => void signOut()}>
                  <LogOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
