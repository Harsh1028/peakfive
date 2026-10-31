import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserRound, LogOut } from "lucide-react";
import { Btn } from "@/components/pf/ui";
import { useAuth } from "@/lib/auth-store";
export function AccountMenu() {
  const auth = useAuth(); const [open,setOpen] = useState(false);
  if (!auth.user) return <Link to="/login" className="text-sm text-primary">Log In</Link>;
  return <div className="relative"><Btn size="icon" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen(!open)}><UserRound className="h-4 w-4" /></Btn>{open && <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-border bg-popover p-2 shadow-lg" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}><nav className="flex flex-col text-sm">{[["/settings","My Profile"],["/scenarios","My Scenarios"],["/settings","Account Settings"]].map(([to,label]) => <Link key={label} to={to} onClick={() => setOpen(false)} className="rounded p-3 hover:bg-accent">{label}</Link>)}<Btn onClick={() => void auth.logout()}><LogOut className="h-4 w-4" />Log Out</Btn></nav></div>}</div>;
}