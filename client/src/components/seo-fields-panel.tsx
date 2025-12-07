import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import { Search, Share2, Tag, Globe, MessageSquare } from "lucide-react";
import type { SEOFields } from "@shared/schema";

interface SEOFieldsPanelProps {
  seo: SEOFields;
  marketName: string;
}

export function SEOFieldsPanel({ seo, marketName }: SEOFieldsPanelProps) {
  const titleCharCount = seo.seoTitle?.length || 0;
  const descCharCount = seo.seoDescription?.length || 0;
  
  const titleStatus = titleCharCount <= 60 ? "optimal" : titleCharCount <= 70 ? "warning" : "error";
  const descStatus = descCharCount >= 150 && descCharCount <= 160 ? "optimal" : 
                     descCharCount >= 120 && descCharCount <= 180 ? "warning" : "error";

  return (
    <Card className="border-chart-2/30 bg-chart-2/5" data-testid="seo-fields-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-chart-2" />
          <CardTitle className="text-lg">SEO - Optimización para Buscadores</CardTitle>
        </div>
        <CardDescription>
          Configuración de cómo aparecerá la página del libro en Google y redes sociales para {marketName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">Título SEO</label>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={titleStatus === "optimal" ? "default" : titleStatus === "warning" ? "secondary" : "destructive"}
                className="text-xs"
              >
                {titleCharCount}/60 caracteres
              </Badge>
              <CopyButton text={seo.seoTitle} size="sm" />
            </div>
          </div>
          <div className="p-3 bg-background rounded-md border text-sm" data-testid="seo-title">
            {seo.seoTitle}
          </div>
          <p className="text-xs text-muted-foreground">
            Título que aparecerá en los resultados de búsqueda de Google.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">Descripción SEO</label>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={descStatus === "optimal" ? "default" : descStatus === "warning" ? "secondary" : "destructive"}
                className="text-xs"
              >
                {descCharCount}/160 caracteres
              </Badge>
              <CopyButton text={seo.seoDescription} size="sm" />
            </div>
          </div>
          <div className="p-3 bg-background rounded-md border text-sm" data-testid="seo-description">
            {seo.seoDescription}
          </div>
          <p className="text-xs text-muted-foreground">
            Descripción breve que aparecerá debajo del título en los resultados de búsqueda.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">Palabras Clave SEO</label>
            </div>
            <CopyButton text={seo.seoKeywords?.join(", ") || ""} size="sm" />
          </div>
          <div className="flex flex-wrap gap-2" data-testid="seo-keywords">
            {seo.seoKeywords?.map((keyword, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {keyword}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Palabras clave que ayudarán a posicionar la página en buscadores.
          </p>
        </div>

        {(seo.ogTitle || seo.ogDescription) && (
          <>
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Share2 className="h-4 w-4 text-chart-2" />
                <span className="text-sm font-medium">Open Graph (Redes Sociales)</span>
              </div>
              
              {seo.ogTitle && (
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Título para compartir</label>
                    <CopyButton text={seo.ogTitle} size="sm" />
                  </div>
                  <div className="p-3 bg-background rounded-md border text-sm" data-testid="og-title">
                    {seo.ogTitle}
                  </div>
                </div>
              )}
              
              {seo.ogDescription && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Descripción para compartir</label>
                    <CopyButton text={seo.ogDescription} size="sm" />
                  </div>
                  <div className="p-3 bg-background rounded-md border text-sm" data-testid="og-description">
                    {seo.ogDescription}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
          <p className="text-xs text-muted-foreground">
            <strong>Uso:</strong> Copia estos valores a la configuración SEO de tu landing page, página de autor, 
            o sistema de gestión de contenidos. El título y descripción SEO aparecerán en Google, 
            mientras que Open Graph controla cómo se ve al compartir en Facebook, LinkedIn y Twitter.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
