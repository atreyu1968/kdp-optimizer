import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Library, PlusCircle, Calendar, BarChart3, Headphones, Scissors } from "lucide-react";
import logoImage from "@/assets/logo.png";

export function AppHeader() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1.5" data-testid="link-home">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg overflow-hidden">
              <img src={logoImage} alt="KDP Optimizer AI" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                KDP Optimizer AI
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Powered by OpenAI
              </p>
            </div>
          </Link>

          <nav className="flex items-center gap-2">
            <Button
              variant={location === "/" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/" data-testid="link-new-optimization">
                <PlusCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Nueva Optimización</span>
                <span className="sm:hidden">Nueva</span>
              </Link>
            </Button>
            <Button
              variant={location === "/library" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/library" data-testid="link-library">
                <Library className="h-4 w-4" />
                <span className="hidden sm:inline">Mi Biblioteca</span>
                <span className="sm:hidden">Biblioteca</span>
              </Link>
            </Button>
            <Button
              variant={location === "/publications" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/publications" data-testid="link-publications">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Publicaciones</span>
                <span className="sm:hidden">KDP</span>
              </Link>
            </Button>
            <Button
              variant={location === "/aura" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/aura" data-testid="link-aura">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Aura</span>
                <span className="sm:hidden">Aura</span>
              </Link>
            </Button>
            <Button
              variant={location.startsWith("/audiobooks") ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/audiobooks" data-testid="link-audiobooks">
                <Headphones className="h-4 w-4" />
                <span className="hidden sm:inline">Audiolibros</span>
                <span className="sm:hidden">Audio</span>
              </Link>
            </Button>
            <Button
              variant={location === "/reeditor" ? "default" : "ghost"}
              size="sm"
              className="gap-2"
              asChild
            >
              <Link href="/reeditor" data-testid="link-reeditor">
                <Scissors className="h-4 w-4" />
                <span className="hidden sm:inline">Reeditor</span>
                <span className="sm:hidden">Edit</span>
              </Link>
            </Button>
          </nav>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
