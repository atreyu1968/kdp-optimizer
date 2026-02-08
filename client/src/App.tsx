import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import Home from "@/pages/home";
import Library from "@/pages/library";
import Publications from "@/pages/publications";
import Aura from "@/pages/aura";
import AudiobookForge from "@/pages/audiobook-forge";
import SocialContentRoom from "@/pages/social-content-room";
import Reeditor from "@/pages/reeditor";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/library" component={Library} />
      <Route path="/publications" component={Publications} />
      <Route path="/social/:id" component={SocialContentRoom} />
      <Route path="/aura" component={Aura} />
      <Route path="/aura/:rest*" component={Aura} />
      <Route path="/audiobooks" component={AudiobookForge} />
      <Route path="/audiobooks/:rest*" component={AudiobookForge} />
      <Route path="/reeditor" component={Reeditor} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "authenticated" | "login">("loading");

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth/check", { credentials: "include" });
      const data = await res.json();
      if (!data.passwordRequired || data.authenticated) {
        setStatus("authenticated");
      } else {
        setStatus("login");
      }
    } catch {
      setStatus("authenticated");
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (status === "login") {
    return <LoginPage onSuccess={() => setStatus("authenticated")} />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AuthGate>
            <Router />
          </AuthGate>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
