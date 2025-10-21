import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BookOpen, Library, PlusCircle } from "lucide-react";

export function AppHeader() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1.5" data-testid="link-home">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
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
                Nueva Optimización
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
                Mi Biblioteca
              </Link>
            </Button>
          </nav>
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
