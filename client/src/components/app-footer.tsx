export function AppFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            © {currentYear} Atreyu Servicios Digitales. Todos los derechos reservados.
          </div>
          <div className="text-xs text-muted-foreground">
            Powered by OpenAI GPT-4
          </div>
        </div>
      </div>
    </footer>
  );
}
