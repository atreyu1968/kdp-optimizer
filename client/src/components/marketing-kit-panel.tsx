import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import { Separator } from "@/components/ui/separator";
import type { MarketingKit } from "@shared/schema";
import {
  Megaphone,
  Hash,
  Gift,
  Star,
  Calendar,
  Quote,
  Video,
  Camera,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import { SiTiktok, SiInstagram, SiPinterest } from "react-icons/si";

interface MarketingKitPanelProps {
  marketingKit: MarketingKit;
}

export function MarketingKitPanel({ marketingKit }: MarketingKitPanelProps) {
  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <Megaphone className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Kit de Marketing Orgánico
          </h3>
          <p className="text-sm text-muted-foreground">
            Ideas y recursos para promocionar tu libro sin presupuesto
          </p>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="social" className="w-full">
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto p-1 bg-muted rounded-lg flex-wrap gap-1">
            <TabsTrigger
              value="social"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-marketing-social"
            >
              <Video className="h-4 w-4 mr-2" />
              <span className="text-sm">Redes Sociales</span>
            </TabsTrigger>
            <TabsTrigger
              value="hashtags"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-marketing-hashtags"
            >
              <Hash className="h-4 w-4 mr-2" />
              <span className="text-sm">Hashtags</span>
            </TabsTrigger>
            <TabsTrigger
              value="leadmagnets"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-marketing-leadmagnets"
            >
              <Gift className="h-4 w-4 mr-2" />
              <span className="text-sm">Lead Magnets</span>
            </TabsTrigger>
            <TabsTrigger
              value="reviews"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-marketing-reviews"
            >
              <Star className="h-4 w-4 mr-2" />
              <span className="text-sm">Reseñas</span>
            </TabsTrigger>
            <TabsTrigger
              value="promo"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-marketing-promo"
            >
              <Calendar className="h-4 w-4 mr-2" />
              <span className="text-sm">Promoción</span>
            </TabsTrigger>
            <TabsTrigger
              value="quotes"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-marketing-quotes"
            >
              <Quote className="h-4 w-4 mr-2" />
              <span className="text-sm">Citas</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="social" className="space-y-4 mt-4">
          <Accordion type="multiple" defaultValue={["tiktok", "instagram", "pinterest"]} className="w-full">
            <AccordionItem value="tiktok" className="border rounded-lg px-4 mb-3">
              <AccordionTrigger className="hover:no-underline" data-testid="accordion-tiktok">
                <div className="flex items-center gap-2">
                  <SiTiktok className="h-4 w-4" />
                  <span className="font-medium">TikTok Hooks</span>
                  <Badge variant="secondary" className="ml-2">{marketingKit.tiktokHooks.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Ganchos para videos cortos que captan la atención
                    </p>
                    <CopyButton
                      text={marketingKit.tiktokHooks.join("\n\n")}
                      label="Copiar todos"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-2">
                    {marketingKit.tiktokHooks.map((hook, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                        data-testid={`tiktok-hook-${index}`}
                      >
                        <div className="flex gap-3 flex-1 min-w-0">
                          <Badge variant="outline" className="shrink-0">{index + 1}</Badge>
                          <p className="text-sm text-foreground">{hook}</p>
                        </div>
                        <CopyButton text={hook} label="" size="icon" variant="ghost" />
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="instagram" className="border rounded-lg px-4 mb-3">
              <AccordionTrigger className="hover:no-underline" data-testid="accordion-instagram">
                <div className="flex items-center gap-2">
                  <SiInstagram className="h-4 w-4" />
                  <span className="font-medium">Ideas para Instagram</span>
                  <Badge variant="secondary" className="ml-2">{marketingKit.instagramPosts.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Conceptos para posts, reels y stories
                    </p>
                    <CopyButton
                      text={marketingKit.instagramPosts.join("\n\n")}
                      label="Copiar todos"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-2">
                    {marketingKit.instagramPosts.map((post, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                        data-testid={`instagram-post-${index}`}
                      >
                        <div className="flex gap-3 flex-1 min-w-0">
                          <Badge variant="outline" className="shrink-0">{index + 1}</Badge>
                          <p className="text-sm text-foreground">{post}</p>
                        </div>
                        <CopyButton text={post} label="" size="icon" variant="ghost" />
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pinterest" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline" data-testid="accordion-pinterest">
                <div className="flex items-center gap-2">
                  <SiPinterest className="h-4 w-4" />
                  <span className="font-medium">Descripciones Pinterest</span>
                  <Badge variant="secondary" className="ml-2">{marketingKit.pinterestDescriptions.length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Descripciones SEO optimizadas para pins
                    </p>
                    <CopyButton
                      text={marketingKit.pinterestDescriptions.join("\n\n")}
                      label="Copiar todas"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-2">
                    {marketingKit.pinterestDescriptions.map((desc, index) => (
                      <div
                        key={index}
                        className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg"
                        data-testid={`pinterest-desc-${index}`}
                      >
                        <div className="flex gap-3 flex-1 min-w-0">
                          <Badge variant="outline" className="shrink-0">{index + 1}</Badge>
                          <p className="text-sm text-foreground">{desc}</p>
                        </div>
                        <CopyButton text={desc} label="" size="icon" variant="ghost" />
                      </div>
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>

        <TabsContent value="hashtags" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium text-foreground">Hashtags Generales</h4>
                </div>
                <CopyButton
                  text={marketingKit.hashtags.general.map(h => `#${h}`).join(" ")}
                  label="Copiar"
                  size="sm"
                />
              </div>
              <div className="flex flex-wrap gap-2" data-testid="hashtags-general">
                {marketingKit.hashtags.general.map((hashtag, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="text-sm"
                    data-testid={`hashtag-general-${index}`}
                  >
                    #{hashtag}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium text-foreground">Hashtags Específicos</h4>
                </div>
                <CopyButton
                  text={marketingKit.hashtags.specific.map(h => `#${h}`).join(" ")}
                  label="Copiar"
                  size="sm"
                />
              </div>
              <div className="flex flex-wrap gap-2" data-testid="hashtags-specific">
                {marketingKit.hashtags.specific.map((hashtag, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="text-sm"
                    data-testid={`hashtag-specific-${index}`}
                  >
                    #{hashtag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-foreground">
                Todos los Hashtags (para copiar)
              </p>
              <CopyButton
                text={[...marketingKit.hashtags.general, ...marketingKit.hashtags.specific].map(h => `#${h}`).join(" ")}
                label="Copiar todos"
                size="sm"
              />
            </div>
            <p className="text-xs text-muted-foreground break-words">
              {[...marketingKit.hashtags.general, ...marketingKit.hashtags.specific].map(h => `#${h}`).join(" ")}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="leadmagnets" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Ideas de Lead Magnets</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Contenido gratuito para capturar emails de lectores potenciales
              </p>
            </div>
            <CopyButton
              text={marketingKit.leadMagnetIdeas.join("\n\n")}
              label="Copiar todas"
              size="sm"
            />
          </div>
          <div className="space-y-3">
            {marketingKit.leadMagnetIdeas.map((idea, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-3 p-4 border border-border rounded-lg"
                data-testid={`leadmagnet-idea-${index}`}
              >
                <div className="flex gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-chart-2/10 rounded-lg shrink-0">
                    <Gift className="h-4 w-4 text-chart-2" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Idea {index + 1}</p>
                    <p className="text-sm text-muted-foreground mt-1">{idea}</p>
                  </div>
                </div>
                <CopyButton text={idea} label="" size="icon" variant="ghost" />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Llamada a la Acción para Reseñas</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Mensaje para incluir al final de tu libro solicitando reseñas
              </p>
            </div>
            <CopyButton
              text={marketingKit.reviewCTA}
              label="Copiar"
            />
          </div>
          <Card className="p-4 bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200/50 dark:border-amber-800/30">
            <div className="flex items-start gap-3">
              <Star className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="review-cta">
                {marketingKit.reviewCTA}
              </p>
            </div>
          </Card>
          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">
              Consejo
            </p>
            <p className="text-xs text-muted-foreground">
              Incluye este mensaje en las últimas páginas de tu ebook. Las reseñas son cruciales 
              para el algoritmo de Amazon y la confianza de futuros lectores.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="promo" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Estrategia de Promoción Gratuita</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Plan para los 5 días gratis de KDP Select
              </p>
            </div>
            <CopyButton
              text={marketingKit.freePromoStrategy}
              label="Copiar estrategia"
            />
          </div>
          <Card className="p-5 border-primary/20" data-testid="free-promo-strategy">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {marketingKit.freePromoStrategy}
                </p>
              </div>
            </div>
          </Card>
          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">
              Recuerda
            </p>
            <p className="text-xs text-muted-foreground">
              Si estás inscrito en KDP Select, tienes 5 días de promoción gratuita cada 90 días. 
              Planifica con anticipación para maximizar descargas y visibilidad.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-foreground">Citas Destacables del Libro</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Frases impactantes para compartir en redes sociales
              </p>
            </div>
            <CopyButton
              text={marketingKit.bookQuotes.map((q, i) => `"${q}"`).join("\n\n")}
              label="Copiar todas"
              size="sm"
            />
          </div>
          <div className="grid gap-3">
            {marketingKit.bookQuotes.map((quote, index) => (
              <div
                key={index}
                className="relative p-4 border border-border rounded-lg bg-gradient-to-r from-muted/30 to-transparent"
                data-testid={`book-quote-${index}`}
              >
                <Quote className="absolute top-3 left-3 h-4 w-4 text-muted-foreground/40" />
                <div className="flex items-start justify-between gap-3 pl-6">
                  <p className="text-sm text-foreground italic">"{quote}"</p>
                  <CopyButton text={`"${quote}"`} label="" size="icon" variant="ghost" />
                </div>
              </div>
            ))}
          </div>
          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">
              Uso recomendado
            </p>
            <p className="text-xs text-muted-foreground">
              Combina estas citas con imágenes atractivas usando Canva o herramientas similares. 
              Son ideales para Instagram Stories, Pinterest pins y posts de Twitter/X.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
