"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/(dashboard)/actions";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopBar({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase();

  return (
    <header className="flex h-12 items-center justify-between border-b border-border px-4">
      <SidebarTrigger className="md:hidden" />
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Account menu"
              className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
