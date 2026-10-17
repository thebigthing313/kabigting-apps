import { getRouteApi, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { ChevronsUpDownIcon, HouseIcon, KeyRoundIcon, LogOutIcon, UsersIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
  useSidebar,
} from "@/components/ui/sidebar"
import { signOut } from "@/data/session"
import { appAt, APPS, isActiveLink, isWithin, type AppEntry } from "@/shell/apps"
import { InstallMenuItem } from "@/shell/install-menu"
import { ThemeMenu } from "@/shell/theme-menu"

const appRoute = getRouteApi("/_app")

/** The signed-in Account as the sidebar shows it. */
export type SidebarUser = { name: string; email: string; role?: string | null }

/** The Shell: a collapsible sidebar on desktop, a drawer on mobile, around the current App. */
export function AppShell() {
  const { session, apps } = appRoute.useRouteContext()
  return (
    <SidebarProvider>
      <ShellSidebar user={session.user} apps={apps} />
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

/**
 * Inside an App, the sidebar lists that App's sections under the App switcher. At Home and on
 * the Admin pages it lists the Apps and, for the Admin, the Admin group.
 */
export function ShellSidebar({ user, apps }: { user: SidebarUser; apps: readonly string[] }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { setOpenMobile } = useSidebar()
  const available = APPS.filter((app) => apps.includes(app.key))
  const current = appAt(pathname)
  // On a phone the sidebar is a drawer; leaving it open over the new page would hide it.
  const closeDrawer = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <SidebarMenu>
          <SidebarMenuItem>
            {current ? (
              <AppSwitcher current={current} available={available} onPick={closeDrawer} />
            ) : (
              <SidebarMenuButton size="lg" render={<Link to="/" onClick={closeDrawer} />}>
                <span className="flex size-8 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">
                  K
                </span>
                <span className="font-semibold">Kabigting Apps</span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {current ? (
          <SidebarGroup>
            <SidebarGroupLabel>{current.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {current.sidebar.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={item.title}
                      isActive={isActiveLink(pathname, item.to, current.to)}
                      render={
                        <Link
                          to={item.to}
                          activeOptions={{ exact: item.to === current.to }}
                          onClick={closeDrawer}
                        />
                      }
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Apps</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      size="lg"
                      tooltip="Home"
                      isActive={isActiveLink(pathname, "/", "/")}
                      render={<Link to="/" activeOptions={{ exact: true }} onClick={closeDrawer} />}
                    >
                      <HouseIcon />
                      <span>Home</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {available.map((app) => (
                    <SidebarMenuItem key={app.key}>
                      <SidebarMenuButton
                        size="lg"
                        tooltip={app.title}
                        render={<Link to={app.to} onClick={closeDrawer} />}
                      >
                        <app.icon />
                        <span>{app.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            {user.role === "admin" && (
              <SidebarGroup>
                <SidebarGroupLabel>Admin</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        size="lg"
                        tooltip="Accounts"
                        isActive={isWithin(pathname, "/admin/accounts")}
                        render={<Link to="/admin/accounts" onClick={closeDrawer} />}
                      >
                        <UsersIcon />
                        <span>Accounts</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <AccountMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** The header inside an App: the current App, opening a menu of Home and the Account's Apps. */
function AppSwitcher({
  current,
  available,
  onPick,
}: {
  current: AppEntry
  available: readonly AppEntry[]
  onPick: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton size="lg" aria-label={`App switcher: ${current.title}`} />}
      >
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <current.icon className="size-4" />
        </span>
        <span className="font-semibold">{current.title}</span>
        <ChevronsUpDownIcon className="ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="min-w-56">
        <DropdownMenuItem className="min-h-11" render={<Link to="/" onClick={onPick} />}>
          <HouseIcon />
          Home
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Apps</DropdownMenuLabel>
          {available.length === 0 ? (
            <DropdownMenuItem className="min-h-11" disabled>
              No Apps yet
            </DropdownMenuItem>
          ) : (
            available.map((app) => (
              <DropdownMenuItem
                key={app.key}
                className="min-h-11"
                render={<Link to={app.to} onClick={onPick} />}
              >
                <app.icon />
                {app.title}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The footer menu: theme, install, password and sign-out. */
function AccountMenu({ user }: { user: SidebarUser }) {
  const navigate = useNavigate()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
            <span className="flex size-8 items-center justify-center rounded-md bg-muted font-medium">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="flex min-w-0 flex-col text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <ThemeMenu />
              <InstallMenuItem />
              <DropdownMenuItem className="min-h-11" render={<Link to="/change-password" />}>
                <KeyRoundIcon />
                Change password
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11"
              onClick={() => void signOut(() => navigate({ to: "/sign-in" }))}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
