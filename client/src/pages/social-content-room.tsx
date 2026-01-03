import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useDropzone } from "react-dropzone";
import { 
  BookOpen, 
  Upload, 
  Copy, 
  Check, 
  Clock, 
  Image as ImageIcon,
  ArrowLeft,
  Hash,
  Sparkles,
  AlertTriangle
} from "lucide-react";
import { SiInstagram, SiFacebook, SiX, SiPinterest, SiTiktok, SiLinkedin } from "react-icons/si";

interface SocialPost {
  type: string;
  content: string;
  hashtags: string[];
  mediaRequirements: string;
  bestTime: string;
  characterLimit?: number;
}

interface PlatformPosts {
  platform: string;
  icon: string;
  color: string;
  posts: SocialPost[];
}

interface SocialPostsResponse {
  manuscript: {
    id: number;
    title: string;
    author: string;
    genre: string;
    coverImageUrl: string | null;
  };
  hasMarketingKit: boolean;
  posts: PlatformPosts[];
}

const platformIcons: Record<string, typeof SiInstagram> = {
  instagram: SiInstagram,
  facebook: SiFacebook,
  twitter: SiX,
  pinterest: SiPinterest,
  tiktok: SiTiktok,
  linkedin: SiLinkedin,
};

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copiado", description: "Texto copiado al portapapeles" });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({ title: "Error", description: "No se pudo copiar", variant: "destructive" });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className={className}
      data-testid="button-copy-post"
    >
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function PostCard({ post, platform, coverUrl }: { post: SocialPost; platform: string; coverUrl?: string | null }) {
  const fullText = `${post.content}\n\n${post.hashtags.join(" ")}`;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{post.type}</Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {post.bestTime}
            </div>
          </div>
          <CopyButton text={fullText} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {coverUrl && (
          <div className="flex justify-center bg-muted/30 rounded-lg p-2">
            <img 
              src={coverUrl} 
              alt="Portada del libro" 
              className="max-h-48 object-contain rounded shadow-sm"
              data-testid="img-post-cover"
            />
          </div>
        )}
        <div className="whitespace-pre-wrap text-sm bg-muted/50 p-3 rounded-lg">
          {post.content}
        </div>

        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.hashtags.slice(0, 10).map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                <Hash className="h-3 w-3 mr-0.5" />
                {tag.replace("#", "")}
              </Badge>
            ))}
            {post.hashtags.length > 10 && (
              <Badge variant="outline" className="text-xs">
                +{post.hashtags.length - 10} más
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3 w-3" />
          {post.mediaRequirements}
        </div>

        {post.characterLimit && (
          <div className="text-xs text-muted-foreground">
            Límite: {post.characterLimit} caracteres
            <span className={post.content.length > post.characterLimit ? "text-red-500 ml-1" : "text-green-500 ml-1"}>
              ({post.content.length} usados)
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoverUploader({ manuscriptId, currentCover, onUpload }: { 
  manuscriptId: number; 
  currentCover: string | null;
  onUpload: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);

    const formData = new FormData();
    formData.append("cover", file);

    try {
      const response = await fetch(`/api/manuscripts/${manuscriptId}/cover`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Error al subir la imagen");

      const data = await response.json();
      onUpload(data.coverImageUrl);
      toast({ title: "Portada subida", description: "La portada se ha guardado correctamente" });
    } catch (error) {
      toast({ 
        title: "Error", 
        description: "No se pudo subir la portada", 
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  }, [manuscriptId, onUpload, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
          ${uploading ? "opacity-50 cursor-not-allowed" : ""}
        `}
        data-testid="dropzone-cover"
      >
        <input {...getInputProps()} data-testid="input-cover-file" />
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {uploading ? "Subiendo..." : isDragActive ? "Suelta la imagen aquí" : "Arrastra una imagen o haz clic para seleccionar"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP o GIF (máx. 10MB)</p>
      </div>

      {currentCover && (
        <div className="flex justify-center">
          <img
            src={currentCover}
            alt="Portada del libro"
            className="max-h-64 rounded-lg shadow-lg object-contain"
            data-testid="img-book-cover"
          />
        </div>
      )}
    </div>
  );
}

export default function SocialContentRoom() {
  const params = useParams();
  const manuscriptId = parseInt(params.id as string);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  const { data: socialData, isLoading, error, refetch } = useQuery<SocialPostsResponse>({
    queryKey: ["/api/manuscripts", manuscriptId, "social-posts"],
    queryFn: async () => {
      const response = await fetch(`/api/manuscripts/${manuscriptId}/social-posts`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Error al cargar posts");
      }
      return response.json();
    },
    enabled: !isNaN(manuscriptId),
  });

  // Update local cover URL when data loads
  if (socialData?.manuscript.coverImageUrl && !coverUrl) {
    setCoverUrl(socialData.manuscript.coverImageUrl);
  }

  const handleCoverUpload = (url: string) => {
    setCoverUrl(url);
    queryClient.invalidateQueries({ queryKey: ["/api/manuscripts", manuscriptId, "social-posts"] });
  };

  if (isNaN(manuscriptId)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <AppHeader />
        <main className="flex-1 container mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">ID de manuscrito inválido</p>
              <Button asChild className="mt-4">
                <Link href="/library" data-testid="link-back-library">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver a la Biblioteca
                </Link>
              </Button>
            </CardContent>
          </Card>
        </main>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" asChild data-testid="button-back-library">
            <Link href="/library">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Biblioteca
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Sala de Contenido Social</h1>
          </div>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-[300px_1fr] gap-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-48 w-full" />
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : "Error al cargar los datos"}
              </p>
              <Button asChild data-testid="link-back-library-error">
                <Link href="/library">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver a la Biblioteca
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : socialData ? (
          <div className="grid lg:grid-cols-[320px_1fr] gap-6">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    {socialData.manuscript.title}
                  </CardTitle>
                  <CardDescription>
                    por {socialData.manuscript.author}
                  </CardDescription>
                  {socialData.manuscript.genre && (
                    <Badge variant="secondary">{socialData.manuscript.genre}</Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <CoverUploader
                    manuscriptId={manuscriptId}
                    currentCover={coverUrl || socialData.manuscript.coverImageUrl}
                    onUpload={handleCoverUpload}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Instrucciones</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>1. Sube la portada de tu libro para incluirla en tus posts</p>
                  <p>2. Explora los posts sugeridos para cada plataforma</p>
                  <p>3. Copia y personaliza el contenido según tu estilo</p>
                  <p>4. Programa tus publicaciones en los horarios sugeridos</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-6">
                {!socialData.hasMarketingKit && (
                  <Alert className="mb-4" data-testid="alert-no-marketing-kit">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Contenido básico</AlertTitle>
                    <AlertDescription>
                      Este libro no tiene un Kit de Marketing generado. Los posts mostrados son genéricos.
                      Para obtener contenido personalizado, ve a la Biblioteca y realiza una optimización completa.
                    </AlertDescription>
                  </Alert>
                )}
                <Tabs defaultValue="instagram">
                  <TabsList className="grid grid-cols-3 lg:grid-cols-6 mb-4" data-testid="tabs-platforms">
                    {socialData.posts.map((platform) => {
                      const IconComponent = platformIcons[platform.icon] || SiInstagram;
                      return (
                        <TabsTrigger
                          key={platform.platform}
                          value={platform.platform.toLowerCase()}
                          className="flex items-center gap-2"
                          data-testid={`tab-${platform.platform.toLowerCase()}`}
                        >
                          <IconComponent className="h-4 w-4" />
                          <span className="hidden sm:inline">{platform.platform}</span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {socialData.posts.map((platform) => (
                    <TabsContent
                      key={platform.platform}
                      value={platform.platform.toLowerCase()}
                      data-testid={`content-${platform.platform.toLowerCase()}`}
                    >
                      <ScrollArea className="h-[calc(100vh-400px)] pr-4">
                        <div className="space-y-1 mb-4">
                          <h3 className="text-lg font-semibold flex items-center gap-2">
                            {platform.platform}
                            <Badge variant="outline">{platform.posts.length} posts</Badge>
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Contenido optimizado para {platform.platform}
                          </p>
                        </div>

                        {platform.posts.map((post, index) => (
                          <PostCard
                            key={index}
                            post={post}
                            platform={platform.platform}
                            coverUrl={coverUrl || socialData.manuscript.coverImageUrl}
                          />
                        ))}
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </main>

      <AppFooter />
    </div>
  );
}
