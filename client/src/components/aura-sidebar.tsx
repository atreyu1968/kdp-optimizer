import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BarChart3, Users, BookOpen, DollarSign, Library, Zap } from "lucide-react";

const menuItems = [
  {
    title: "Dashboard",
    url: "/aura",
    icon: BarChart3,
  },
  {
    title: "Aura Ventas",
    url: "/aura/sales",
    icon: DollarSign,
  },
  {
    title: "Aura Unlimited",
    url: "/aura/unlimited",
    icon: Zap,
  },
  {
    title: "Seudónimos",
    url: "/aura/pen-names",
    icon: Users,
  },
  {
    title: "Series",
    url: "/aura/series",
    icon: Library,
  },
  {
    title: "Libros",
    url: "/aura/books",
    icon: BookOpen,
  },
];

export function AuraSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Aura Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`sidebar-${item.title.toLowerCase().replace(' ', '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
