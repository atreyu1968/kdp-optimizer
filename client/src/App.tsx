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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/library" component={Library} />
      <Route path="/publications" component={Publications} />
      <Route path="/aura" component={Aura} />
      <Route path="/aura/:rest*" component={Aura} />
      <Route path="/audiobooks" component={AudiobookForge} />
      <Route path="/audiobooks/:rest*" component={AudiobookForge} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
