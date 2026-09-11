"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  SearchCheck,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/audits", label: "Audits", icon: SearchCheck },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 py-3">
        <span className="text-sm font-medium tracking-tight text-sidebar-foreground">
          wibsity
        </span>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={isActive}
                  render={<Link href={item.href} />}
                  className="data-[active=true]:border-l-2 data-[active=true]:border-l-primary data-[active=true]:bg-sidebar-accent data-[active=true]:pl-[calc(--spacing(2)-2px)]"
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="px-2 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith("/settings")}
              render={<Link href="/settings" />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
