import { Switch, Route, Link } from "wouter";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { AudiobookSidebar } from "@/components/audiobook-sidebar";
import { AppFooter } from "@/components/app-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlusCircle, Library, Calendar, BarChart3 } from "lucide-react";
import AudiobookProjects from "./audiobook-projects";
import AudiobookSettings from "./audiobook-settings";

export default function AudiobookForge() {
  const style = {
    "--sidebar-width": "14rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AudiobookSidebar />
        <SidebarInset className="flex flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" data-testid="button-audiobook-sidebar-toggle" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex-1 flex items-center gap-2">
              <h1 className="text-xl font-semibold">AudiobookForge</h1>
              <Separator orientation="vertical" className="h-4 hidden sm:block" />
              <nav className="hidden sm:flex items-center gap-1">
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/" data-testid="link-home-from-audiobook">
                    <PlusCircle className="h-4 w-4" />
                    <span className="hidden md:inline">Nueva Optimización</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/library" data-testid="link-library-from-audiobook">
                    <Library className="h-4 w-4" />
                    <span className="hidden md:inline">Biblioteca</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/publications" data-testid="link-publications-from-audiobook">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden md:inline">Publicaciones</span>
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" asChild>
                  <Link href="/aura" data-testid="link-aura-from-audiobook">
                    <BarChart3 className="h-4 w-4" />
                    <span className="hidden md:inline">Aura</span>
                  </Link>
                </Button>
              </nav>
            </div>
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-auto p-6">
            <Switch>
              <Route path="/audiobooks" component={AudiobookProjects} />
              <Route path="/audiobooks/settings" component={AudiobookSettings} />
              <Route path="/audiobooks/:rest*" component={AudiobookProjects} />
            </Switch>
          </main>

          <AppFooter />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
