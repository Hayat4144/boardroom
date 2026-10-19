import { useQueryClient } from "@tanstack/react-query";
import { Activity, LayoutList, LogOut } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/queries";
import { authClient } from "@/lib/auth-client";
import type { Me } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const mainNav: NavItem[] = [{ to: "/", label: "Watchlist", icon: LayoutList, end: true }];
const adminNav: NavItem[] = [{ to: "/admin/llm-calls", label: "LLM calls", icon: Activity }];

function SideNavLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive &&
            "bg-sidebar-accent text-sidebar-accent-foreground before:bg-brand before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r",
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function UserMenu({ me, compact = false }: { me: Me; compact?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const signOut = async () => {
    await authClient.signOut();
    qc.clear();
    void navigate("/login", { replace: true });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "hover:bg-sidebar-accent flex items-center gap-2.5 rounded-md text-left outline-none",
          compact ? "p-1" : "w-full p-1.5",
        )}
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-brand-subtle text-brand text-xs font-semibold">
            {initials(me.name || me.email)}
          </AvatarFallback>
        </Avatar>
        {!compact && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{me.name}</div>
            <div className="text-muted-foreground truncate text-xs">{me.email}</div>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? "end" : "start"}
        side={compact ? "bottom" : "top"}
        className="w-56"
      >
        <DropdownMenuLabel className="text-xs font-normal">
          <div className="truncate font-medium">{me.email}</div>
          <div className="text-muted-foreground">{me.role === "admin" ? "Admin" : "User"}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell() {
  const { data: me } = useMe();
  if (!me) return null;
  const isAdmin = me.role === "admin";

  return (
    <div className="flex min-h-svh">
      {/* Sidebar (md+) */}
      <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Brand />
          <ThemeToggle />
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            {mainNav.map((item) => (
              <SideNavLink key={item.to} item={item} />
            ))}
          </div>
          {isAdmin && (
            <div className="space-y-1">
              <div className="text-muted-foreground px-2.5 text-[11px] font-semibold tracking-wider uppercase">
                Admin
              </div>
              <div className="space-y-0.5">
                {adminNav.map((item) => (
                  <SideNavLink key={item.to} item={item} />
                ))}
              </div>
            </div>
          )}
        </nav>
        <div className="border-t p-2">
          <UserMenu me={me} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="bg-sidebar sticky top-0 z-20 border-b md:hidden">
          <div className="flex h-12 items-center justify-between px-4">
            <Brand />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <UserMenu me={me} compact />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {[...mainNav, ...(isAdmin ? adminNav : [])].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium",
                    isActive ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
                  )
                }
              >
                <item.icon className="size-3.5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
