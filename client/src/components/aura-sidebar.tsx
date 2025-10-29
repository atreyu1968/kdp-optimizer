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
import { BarChart3, Upload, Users, BookOpen, TrendingUp, Library, Sparkles, Zap } from "lucide-react";

const menuItems = [
  {
    title: "Dashboard",
    url: "/aura",
    icon: BarChart3,
  },
  {
    title: "Análisis IA",
    url: "/aura/insights",
    icon: Sparkles,
  },
  {
    title: "Aura Unlimited",
    url: "/aura/unlimited",
    icon: Zap,
  },
  {
    title: "Importar",
    url: "/aura/import",
    icon: Upload,
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
  {
    title: "Ventas",
    url: "/aura/sales",
    icon: TrendingUp,
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
