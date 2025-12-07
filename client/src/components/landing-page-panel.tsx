import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "./copy-button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LandingPageContent } from "@shared/schema";
import {
  Sparkles,
  BookOpen,
  ListChecks,
  Quote,
  Newspaper,
} from "lucide-react";

interface LandingPagePanelProps {
  landingPageContent: LandingPageContent;
}

export function LandingPagePanel({ landingPageContent }: LandingPagePanelProps) {
  // Normalize data to ensure arrays are always arrays (defensive programming)
  const safeContent = {
    tagline: landingPageContent?.tagline || "",
    extendedSynopsis: landingPageContent?.extendedSynopsis || "",
    featuredCharacteristics: Array.isArray(landingPageContent?.featuredCharacteristics) 
      ? landingPageContent.featuredCharacteristics 
      : [],
    memorableQuotes: Array.isArray(landingPageContent?.memorableQuotes) 
      ? landingPageContent.memorableQuotes 
      : [],
    pressNotes: landingPageContent?.pressNotes || "",
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-violet-500/10 rounded-lg">
          <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Contenido para Landing Page
          </h3>
          <p className="text-sm text-muted-foreground">
            Todo lo que necesitas para crear la página de tu libro
          </p>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="tagline" className="w-full">
        <div className="overflow-x-auto pb-2">
          <TabsList className="inline-flex h-auto p-1 bg-muted rounded-lg flex-wrap gap-1">
            <TabsTrigger
              value="tagline"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-landing-tagline"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              <span className="text-sm">Tagline</span>
            </TabsTrigger>
            <TabsTrigger
              value="synopsis"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-landing-synopsis"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              <span className="text-sm">Sinopsis</span>
            </TabsTrigger>
            <TabsTrigger
              value="features"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-landing-features"
            >
              <ListChecks className="h-4 w-4 mr-2" />
              <span className="text-sm">Características</span>
            </TabsTrigger>
            <TabsTrigger
              value="quotes"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-landing-quotes"
            >
              <Quote className="h-4 w-4 mr-2" />
              <span className="text-sm">Citas</span>
            </TabsTrigger>
            <TabsTrigger
              value="press"
              className="data-[state=active]:bg-background px-3 py-2"
              data-testid="tab-landing-press"
            >
              <Newspaper className="h-4 w-4 mr-2" />
              <span className="text-sm">Prensa</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="tagline" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Tagline</h4>
                <p className="text-xs text-muted-foreground">
                  Una frase impactante que captura la esencia del libro
                </p>
              </div>
              <CopyButton
                text={safeContent.tagline}
                label="Copiar"
                size="sm"
              />
            </div>
            <div className="p-6 bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-lg border border-violet-500/20">
              <p className="text-xl font-medium text-center text-foreground italic">
                "{safeContent.tagline}"
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="synopsis" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Sinopsis Extendida</h4>
                <p className="text-xs text-muted-foreground">
                  Descripción detallada en formato Markdown
                </p>
              </div>
              <CopyButton
                text={safeContent.extendedSynopsis}
                label="Copiar Markdown"
                size="sm"
              />
            </div>
            <ScrollArea className="h-[400px] w-full rounded-lg border p-4 bg-muted/30">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={safeContent.extendedSynopsis} />
              </div>
            </ScrollArea>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-3 w-3" />
              <span>El contenido está en formato Markdown para fácil integración</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Características Destacadas</h4>
                <p className="text-xs text-muted-foreground">
                  Puntos clave que hacen único a tu libro
                </p>
              </div>
              {safeContent.featuredCharacteristics && safeContent.featuredCharacteristics.length > 0 && (
                <CopyButton
                  text={safeContent.featuredCharacteristics.map(c => `• ${c}`).join("\n")}
                  label="Copiar todas"
                  size="sm"
                />
              )}
            </div>
            <div className="space-y-2">
              {safeContent.featuredCharacteristics && safeContent.featuredCharacteristics.length > 0 ? (
                safeContent.featuredCharacteristics.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg hover-elevate"
                    data-testid={`feature-item-${index}`}
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-1 bg-violet-500/10 rounded-full mt-0.5">
                        <ListChecks className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                      </div>
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                    <CopyButton text={feature} size="sm" />
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm bg-muted/30 rounded-lg">
                  No se generaron características destacadas
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quotes" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Citas Memorables</h4>
                <p className="text-xs text-muted-foreground">
                  Extractos impactantes del libro
                </p>
              </div>
              {safeContent.memorableQuotes && safeContent.memorableQuotes.length > 0 && (
                <CopyButton
                  text={safeContent.memorableQuotes.map(q => `"${q}"`).join("\n\n")}
                  label="Copiar todas"
                  size="sm"
                />
              )}
            </div>
            <div className="grid gap-3">
              {safeContent.memorableQuotes && safeContent.memorableQuotes.length > 0 ? (
                safeContent.memorableQuotes.map((quote, index) => (
                  <div
                    key={index}
                    className="relative p-4 bg-gradient-to-r from-muted/50 to-muted/30 rounded-lg border border-muted hover-elevate"
                    data-testid={`quote-item-${index}`}
                  >
                    <Quote className="absolute top-3 left-3 h-4 w-4 text-muted-foreground/40" />
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-foreground italic pl-6 pr-2 flex-1">
                        "{quote}"
                      </p>
                      <CopyButton text={`"${quote}"`} size="sm" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-muted-foreground text-sm bg-muted/30 rounded-lg">
                  No se encontraron citas memorables en el manuscrito
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="press" className="space-y-4 mt-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">Notas de Prensa</h4>
                <p className="text-xs text-muted-foreground">
                  Material promocional para medios y publicidad
                </p>
              </div>
              <CopyButton
                text={safeContent.pressNotes}
                label="Copiar todo"
                size="sm"
              />
            </div>
            <ScrollArea className="h-[300px] w-full rounded-lg border p-4 bg-muted/30">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                {safeContent.pressNotes}
              </div>
            </ScrollArea>
            <Badge variant="secondary" className="text-xs">
              <Newspaper className="h-3 w-3 mr-1" />
              Listo para kit de prensa
            </Badge>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm text-foreground/90">{item}</li>
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={index} className="text-lg font-semibold text-foreground mt-4 mb-2">
          {trimmed.replace("## ", "")}
        </h2>
      );
    } else if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={index} className="text-base font-medium text-foreground mt-3 mb-1">
          {trimmed.replace("### ", "")}
        </h3>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      inList = true;
      listItems.push(trimmed.replace(/^[-*]\s/, ""));
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      const formattedLine = formatInlineMarkdown(trimmed);
      elements.push(
        <p key={index} className="text-sm text-foreground/90 my-2">
          {formattedLine}
        </p>
      );
    }
  });

  flushList();

  return <>{elements}</>;
}

function formatInlineMarkdown(text: string): JSX.Element {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(.+?)\*/);

    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) {
        parts.push(remaining.substring(0, boldMatch.index));
      }
      parts.push(<strong key={keyIndex++}>{boldMatch[1]}</strong>);
      remaining = remaining.substring(boldMatch.index + boldMatch[0].length);
    } else if (italicMatch && italicMatch.index !== undefined && !italicMatch[0].startsWith("**")) {
      if (italicMatch.index > 0) {
        parts.push(remaining.substring(0, italicMatch.index));
      }
      parts.push(<em key={keyIndex++}>{italicMatch[1]}</em>);
      remaining = remaining.substring(italicMatch.index + italicMatch[0].length);
    } else {
      parts.push(remaining);
      remaining = "";
    }
  }

  return <>{parts}</>;
}
