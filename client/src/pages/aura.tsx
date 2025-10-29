import { Switch, Route, Link } from "wouter";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AuraSidebar } from "@/components/aura-sidebar";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlusCircle, Library, Calendar } from "lucide-react";
import AuraDashboard from "@/pages/aura-dashboard";
import AuraImportPage from "@/pages/aura-import";
import AuraPenNames from "@/pages/aura-pen-names";
import AuraSeries from "@/pages/aura-series";
import AuraBooks from "@/pages/aura-books";
import AuraSales from "@/pages/aura-sales";
import AuraUnlimited from "@/pages/aura-unlimited";

export default function Aura() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AuraSidebar />
        <SidebarInset className="flex flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" data-testid="button-sidebar-toggle" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex-1 flex items-center gap-2">
              <h1 className="text-xl font-semibold">Aura Analytics</h1>
              <Separator orientation="vertical" className="h-4 hidden sm:block" />
              <nav className="hidden sm:flex items-center gap-1">
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/" data-testid="link-home">
                    <PlusCircle className="h-4 w-4" />
                    <span className="hidden md:inline">Nueva Optimización</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/library" data-testid="link-library">
                    <Library className="h-4 w-4" />
                    <span className="hidden md:inline">Biblioteca</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/publications" data-testid="link-publications">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden md:inline">Publicaciones</span>
                  </Link>
                </Button>
              </nav>
            </div>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto p-6">
            <Switch>
              <Route path="/aura" component={AuraDashboard} />
              <Route path="/aura/import" component={AuraImportPage} />
              <Route path="/aura/sales" component={AuraSales} />
              <Route path="/aura/unlimited" component={AuraUnlimited} />
              <Route path="/aura/pen-names" component={AuraPenNames} />
              <Route path="/aura/series" component={AuraSeries} />
              <Route path="/aura/books" component={AuraBooks} />
              <Route path="/aura/:rest*" component={AuraDashboard} />
            </Switch>
          </main>

          <AppFooter />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
