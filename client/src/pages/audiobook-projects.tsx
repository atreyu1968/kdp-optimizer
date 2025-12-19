import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Plus, Headphones, FileAudio, Clock, CheckCircle2, AlertCircle, Loader2, 
  Upload, FileText, Play, Download, Trash2, ArrowLeft, Volume2, XCircle,
  RefreshCw, ChevronRight, AlertTriangle, Pause, RotateCcw, Archive, Square,
  Radio, Copy, Tag, Euro, Disc3, Image, Calendar, User, Music
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AudiobookProject, AudiobookChapter, SynthesisJob } from "@shared/schema";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  draft: { label: "Borrador", variant: "secondary", icon: Clock },
  parsing: { label: "Extrayendo", variant: "outline", icon: Loader2 },
  ready: { label: "Listo", variant: "default", icon: CheckCircle2 },
  synthesizing: { label: "Sintetizando", variant: "outline", icon: Loader2 },
  mastering: { label: "Masterizando", variant: "outline", icon: Loader2 },
  paused: { label: "Pausado", variant: "secondary", icon: Pause },
  completed: { label: "Completado", variant: "default", icon: CheckCircle2 },
  failed: { label: "Error", variant: "destructive", icon: AlertCircle },
};

const jobStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending: { label: "Pendiente", variant: "secondary", icon: Clock },
  submitted: { label: "Enviado", variant: "outline", icon: Loader2 },
  processing: { label: "Procesando", variant: "outline", icon: Loader2 },
  completed: { label: "Completado", variant: "default", icon: CheckCircle2 },
  mastering: { label: "Masterizando", variant: "outline", icon: Volume2 },
  mastered: { label: "Masterizado", variant: "default", icon: CheckCircle2 },
  failed: { label: "Error", variant: "destructive", icon: XCircle },
};

const engineLabels: Record<string, string> = {
  neural: "Neural",
  "long-form": "Long-Form (Audiolibros)",
  generative: "Generativa",
  standard: "Estándar",
};

interface Voice {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  engine: string;
}

interface GoogleVoice {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  voiceType: string;
}

type TTSProvider = "polly" | "google";

interface ProjectDetailProps {
  projectId: number;
  onBack: () => void;
}

interface IVooxChapterMeta {
  chapterNumber: number;
  title: string;
  formattedTitle: string;
  formattedDescription: string;
  isExclusiveForFans: boolean;
  accessLabel: string;
}

interface IVooxMetadataResponse {
  success: boolean;
  projectId: number;
  projectTitle: string;
  metadata: {
    programTitle: string;
    programDescription: string;
    programCategory: string;
    programTags: string[];
    subscriptionPrice: number;
    freeChaptersCount: number;
    episodeTitleTemplate: string;
    episodeDescriptionTemplate: string;
    freeAccessCTA: string;
    paidAccessCTA: string;
  };
  chapters: IVooxChapterMeta[];
  publishingGuide: string;
}

function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [playingJobId, setPlayingJobId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showIVooxDialog, setShowIVooxDialog] = useState(false);
  const [ivooxData, setIvooxData] = useState<IVooxMetadataResponse | null>(null);
  const [showMetadataDialog, setShowMetadataDialog] = useState(false);
  const [metadataForm, setMetadataForm] = useState({
    albumName: "",
    albumArtist: "",
    albumYear: "",
    albumGenre: "Audiobook",
    coverImageUrl: "",
  });
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(null);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);

  // Cleanup audio on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const { data: project, isLoading: loadingProject } = useQuery<AudiobookProject>({
    queryKey: ["/api/audiobooks/projects", projectId],
  });

  // Load metadata form when project data is available
  useEffect(() => {
    if (project) {
      setMetadataForm({
        albumName: project.albumName || project.title || "",
        albumArtist: project.albumArtist || "",
        albumYear: project.albumYear || new Date().getFullYear().toString(),
        albumGenre: project.albumGenre || "Audiobook",
        coverImageUrl: project.coverImageUrl || "",
      });
      // Set preview if URL exists
      if (project.coverImageUrl) {
        setCoverImagePreview(project.coverImageUrl);
        setCoverImageFile(null);
      }
    }
  }, [project]);

  const { data: chapters, isLoading: loadingChapters } = useQuery<AudiobookChapter[]>({
    queryKey: ["/api/audiobooks/projects", projectId, "chapters"],
  });

  const { data: jobs, isLoading: loadingJobs, refetch: refetchJobs } = useQuery<SynthesisJob[]>({
    queryKey: ["/api/audiobooks/projects", projectId, "jobs"],
    refetchInterval: project?.status === "synthesizing" || project?.status === "mastering" ? 3000 : false,
  });

  const synthesizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audiobooks/projects/${projectId}/synthesize`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Síntesis iniciada", description: "El proceso de síntesis ha comenzado." });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId, "jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo iniciar la síntesis", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/audiobooks/projects/${projectId}`);
    },
    onSuccess: () => {
      toast({ title: "Proyecto eliminado" });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects"] });
      onBack();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo eliminar el proyecto", variant: "destructive" });
    },
  });

  const pauseSynthesisMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audiobooks/projects/${projectId}/pause`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Síntesis pausada", description: "El proceso se ha detenido." });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId, "jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo pausar", variant: "destructive" });
    },
  });

  const resumeSynthesisMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audiobooks/projects/${projectId}/resume`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Síntesis reanudada", description: "El proceso continúa." });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId, "jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo reanudar", variant: "destructive" });
    },
  });

  const resynthesizeChapterMutation = useMutation({
    mutationFn: async (chapterId: number) => {
      const res = await apiRequest("POST", `/api/audiobooks/chapters/${chapterId}/resynthesize`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Re-síntesis iniciada", description: "El capítulo se está regenerando." });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId, "jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo re-sintetizar", variant: "destructive" });
    },
  });

  const masterChapterMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("POST", `/api/audiobooks/jobs/${jobId}/master`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Masterización iniciada", description: "El audio se está masterizando." });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId, "jobs"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo masterizar", variant: "destructive" });
    },
  });

  const generateIVooxMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audiobooks/projects/${projectId}/ivoox-metadata`);
      return res.json();
    },
    onSuccess: (data: IVooxMetadataResponse) => {
      console.log("[iVoox Frontend] Received data:", data);
      console.log("[iVoox Frontend] Publishing guide:", data.publishingGuide?.substring(0, 100));
      setIvooxData(data);
      setShowIVooxDialog(true);
      toast({ title: "Metadatos iVoox generados", description: "Se han optimizado los metadatos para iVoox." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudieron generar metadatos iVoox", variant: "destructive" });
    },
  });

  const updateMetadataMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...metadataForm };
      
      // If a new cover image file was selected, convert to base64
      if (coverImageFile) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(coverImageFile);
        });
        const base64 = await base64Promise;
        payload.coverImageUrl = base64;
      }
      
      const res = await apiRequest("PUT", `/api/audiobooks/projects/${projectId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Metadatos guardados", description: "Los metadatos ID3 se aplicarán a los archivos de audio." });
      setCoverImageFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects", projectId] });
      setShowMetadataDialog(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudieron guardar los metadatos", variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado", description: `${label} copiado al portapapeles` });
  };

  // Audio player functions
  const handlePlayPause = (jobId: number) => {
    if (playingJobId === jobId && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      // Stop current audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
      }
      // Create new audio element
      const audio = new Audio(`/api/audiobooks/jobs/${jobId}/download`);
      audio.onended = () => {
        setIsPlaying(false);
        setPlayingJobId(null);
      };
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
      audioRef.current = audio;
      audio.play();
      setPlayingJobId(jobId);
      setIsPlaying(true);
    }
  };

  const handleStopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setPlayingJobId(null);
  };

  if (loadingProject) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Proyecto no encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
      </div>
    );
  }

  const status = statusConfig[project.status] || statusConfig.draft;
  const StatusIcon = status.icon;
  
  // Contar capítulos únicos masterizados (no jobs)
  const masteredChapterIds = new Set(
    jobs?.filter(j => j.status === "mastered").map(j => j.chapterId) || []
  );
  const completedCount = masteredChapterIds.size;
  const totalChapters = project.totalChapters || 0;
  const progress = totalChapters > 0 ? (completedCount / totalChapters) * 100 : 0;

  const canSynthesize = project.status === "ready" && (project.totalChapters || 0) > 0;
  const isProcessing = project.status === "synthesizing" || project.status === "mastering";
  const isCompleted = project.status === "completed";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-projects">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" data-testid="text-project-title">
              {project.title}
            </h2>
            <Badge variant={status.variant} className="gap-1">
              <StatusIcon className={`h-3 w-3 ${isProcessing ? "animate-spin" : ""}`} />
              {status.label}
            </Badge>
          </div>
          <p className="text-muted-foreground">{project.author}</p>
        </div>
        <div className="flex gap-2">
          {playingJobId !== null && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleStopAudio}
              data-testid="button-stop-audio"
            >
              <Square className="h-4 w-4 mr-2" />
              Detener Audio
            </Button>
          )}
          {isProcessing && (
            <>
              <Button variant="outline" size="sm" onClick={() => refetchJobs()} data-testid="button-refresh-status">
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => pauseSynthesisMutation.mutate()}
                disabled={pauseSynthesisMutation.isPending}
                data-testid="button-pause-synthesis"
              >
                <Square className="h-4 w-4 mr-2" />
                Detener
              </Button>
            </>
          )}
          {project.status === "paused" && (
            <Button 
              size="sm" 
              onClick={() => resumeSynthesisMutation.mutate()}
              disabled={resumeSynthesisMutation.isPending}
              data-testid="button-resume-synthesis"
            >
              <Play className="h-4 w-4 mr-2" />
              Reanudar
            </Button>
          )}
          {canSynthesize && (
            <Button 
              onClick={() => synthesizeMutation.mutate()} 
              disabled={synthesizeMutation.isPending}
              data-testid="button-start-synthesis"
              className="gap-2"
            >
              {synthesizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Iniciar Síntesis
            </Button>
          )}
          <Button 
            variant="outline"
            size="sm"
            onClick={() => setShowMetadataDialog(true)}
            data-testid="button-edit-metadata"
            className="gap-2"
          >
            <Disc3 className="h-4 w-4" />
            Metadatos
          </Button>
          <Button 
            variant="outline"
            size="sm"
            onClick={() => generateIVooxMutation.mutate()}
            disabled={generateIVooxMutation.isPending || !chapters || chapters.length === 0}
            data-testid="button-generate-ivoox"
            className="gap-2"
          >
            {generateIVooxMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Radio className="h-4 w-4" />
            )}
            iVoox
          </Button>
          <Button 
            variant="destructive" 
            size="icon" 
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteMutation.isPending || isProcessing}
            data-testid="button-delete-project"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Eliminar proyecto?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el proyecto 
              "<span className="font-medium">{project.title}</span>" junto con todos sus 
              capítulos y archivos de audio generados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Metadata ID3 Dialog */}
      <Dialog open={showMetadataDialog} onOpenChange={setShowMetadataDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Disc3 className="h-5 w-5" />
              Metadatos ID3 del Audio
            </DialogTitle>
            <DialogDescription>
              Configura los metadatos que se incrustarán en los archivos MP3 (título, artista, carátula, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="albumName" className="flex items-center gap-2">
                <Music className="h-4 w-4" />
                Nombre del Álbum
              </Label>
              <Input
                id="albumName"
                value={metadataForm.albumName}
                onChange={(e) => setMetadataForm(prev => ({ ...prev, albumName: e.target.value }))}
                placeholder="Título del audiolibro"
                data-testid="input-album-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="albumArtist" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Intérprete / Narrador
              </Label>
              <Input
                id="albumArtist"
                value={metadataForm.albumArtist}
                onChange={(e) => setMetadataForm(prev => ({ ...prev, albumArtist: e.target.value }))}
                placeholder="Nombre del narrador"
                data-testid="input-album-artist"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="albumYear" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Año
                </Label>
                <Input
                  id="albumYear"
                  value={metadataForm.albumYear}
                  onChange={(e) => setMetadataForm(prev => ({ ...prev, albumYear: e.target.value }))}
                  placeholder="2024"
                  data-testid="input-album-year"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="albumGenre" className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Género
                </Label>
                <Select
                  value={metadataForm.albumGenre}
                  onValueChange={(value) => setMetadataForm(prev => ({ ...prev, albumGenre: value }))}
                >
                  <SelectTrigger id="albumGenre" data-testid="select-album-genre">
                    <SelectValue placeholder="Seleccionar género" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Audiobook">Audiobook</SelectItem>
                    <SelectItem value="Fiction">Fiction</SelectItem>
                    <SelectItem value="Non-Fiction">Non-Fiction</SelectItem>
                    <SelectItem value="Romance">Romance</SelectItem>
                    <SelectItem value="Fantasy">Fantasy</SelectItem>
                    <SelectItem value="Thriller">Thriller</SelectItem>
                    <SelectItem value="Mystery">Mystery</SelectItem>
                    <SelectItem value="Science Fiction">Science Fiction</SelectItem>
                    <SelectItem value="Self-Help">Self-Help</SelectItem>
                    <SelectItem value="Biography">Biography</SelectItem>
                    <SelectItem value="Children">Children</SelectItem>
                    <SelectItem value="Poetry">Poetry</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Image className="h-4 w-4" />
                Carátula del Álbum
              </Label>
              <div className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors" data-testid="dropzone-cover">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 10 * 1024 * 1024) {
                        toast({ title: "Archivo muy grande", description: "La carátula debe pesar menos de 10MB", variant: "destructive" });
                        return;
                      }
                      setCoverImageFile(file);
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setCoverImagePreview(event.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  data-testid="input-cover-file"
                  className="hidden"
                  id="cover-input"
                />
                <label htmlFor="cover-input" className="text-center cursor-pointer w-full">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Arrastra una imagen o haz clic aquí</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG o WebP • Máximo 10MB</p>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Recomendado: 3000x3000 píxeles para mejor calidad.
              </p>
            </div>
            {coverImagePreview && (
              <div className="flex flex-col items-center gap-2">
                <img 
                  src={coverImagePreview} 
                  alt="Vista previa de carátula"
                  className="max-w-32 max-h-32 rounded-md border object-cover"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCoverImagePreview(null);
                    setCoverImageFile(null);
                  }}
                  data-testid="button-remove-cover"
                  className="text-xs"
                >
                  Remover imagen
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMetadataDialog(false)} data-testid="button-cancel-metadata">
              Cancelar
            </Button>
            <Button 
              onClick={() => updateMetadataMutation.mutate()}
              disabled={updateMetadataMutation.isPending}
              data-testid="button-save-metadata"
            >
              {updateMetadataMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Guardar Metadatos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {project.errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{project.errorMessage}</AlertDescription>
        </Alert>
      )}

      {isProcessing && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Progreso de Síntesis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Capítulos masterizados</span>
              <span className="font-medium">{completedCount} / {totalChapters}</span>
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-synthesis" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Información del Proyecto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Archivo fuente</span>
              <span className="font-medium">{project.sourceFileName}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Voz</span>
              <span className="font-medium">{project.voiceId}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Idioma</span>
              <span className="font-medium">{project.voiceLocale}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Motor</span>
              <Badge variant="outline">{engineLabels[project.engine] || project.engine}</Badge>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Capítulos</span>
              <span className="font-medium">{project.totalChapters || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileAudio className="h-5 w-5" />
              Capítulos
            </CardTitle>
            <CardDescription>
              {loadingChapters ? "Cargando..." : `${chapters?.length || 0} capítulos detectados`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChapters ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : chapters && chapters.length > 0 ? (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {chapters.map((chapter, index) => {
                    // Get the most recent job for this chapter (jobs are now sorted by createdAt DESC, so first match is the newest)
                    const job = jobs?.find(j => j.chapterId === chapter.id);
                    const jobStatus = job ? (jobStatusConfig[job.status] || jobStatusConfig.pending) : null;
                    const JobIcon = jobStatus?.icon;
                    return (
                      <div 
                        key={chapter.id} 
                        className="flex items-center justify-between p-2 rounded-md border"
                        data-testid={`chapter-row-${chapter.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                          <span className="text-sm font-medium truncate">{chapter.title}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground mr-1">
                            ~{Math.ceil((chapter.estimatedDurationSeconds || 0) / 60)} min
                          </span>
                          {jobStatus && (
                            <Badge 
                              variant={jobStatus.variant} 
                              className={`gap-1 text-xs ${job?.status === "mastered" ? "bg-green-500 text-white hover:bg-green-600" : ""}`}
                            >
                              {JobIcon && <JobIcon className={`h-3 w-3 ${job?.status === "processing" || job?.status === "submitted" ? "animate-spin" : ""}`} />}
                              {jobStatus.label}
                            </Badge>
                          )}
                          {job?.finalAudioUrl && (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6"
                                onClick={() => handlePlayPause(job.id)}
                                data-testid={`play-chapter-${chapter.id}`}
                              >
                                {playingJobId === job.id && isPlaying ? (
                                  <Pause className="h-3 w-3" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                              </Button>
                              <Button variant="ghost" size="icon" asChild className="h-6 w-6">
                                <a href={`/api/audiobooks/jobs/${job.id}/download`} data-testid={`download-chapter-${chapter.id}`}>
                                  <Download className="h-3 w-3" />
                                </a>
                              </Button>
                            </>
                          )}
                          {job?.status === "completed" && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => masterChapterMutation.mutate(job.id)}
                              disabled={masterChapterMutation.isPending || isProcessing}
                              title="Masterizar audio"
                              data-testid={`master-chapter-${chapter.id}`}
                            >
                              <Volume2 className="h-3 w-3" />
                            </Button>
                          )}
                          {(job?.status === "mastered" || job?.status === "completed" || job?.status === "failed") && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => resynthesizeChapterMutation.mutate(chapter.id)}
                              disabled={resynthesizeChapterMutation.isPending || isProcessing}
                              title="Re-sintetizar capítulo"
                              data-testid={`resynthesize-chapter-${chapter.id}`}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No se detectaron capítulos</p>
            )}
          </CardContent>
        </Card>
      </div>

      {isCompleted && jobs && jobs.some(j => j.finalAudioUrl) && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Audiolibro Completado
            </CardTitle>
            <CardDescription>
              Descarga los archivos de audio masterizados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild className="gap-2" data-testid="button-download-zip">
                <a href={`/api/audiobooks/projects/${projectId}/download-zip`}>
                  <Archive className="h-4 w-4" />
                  Descargar Todo (ZIP)
                </a>
              </Button>
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => generateIVooxMutation.mutate()}
                disabled={generateIVooxMutation.isPending}
                data-testid="button-generate-ivoox"
              >
                {generateIVooxMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Radio className="h-4 w-4" />
                )}
                Generar para iVoox
              </Button>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              {jobs.filter(j => j.finalAudioUrl).map((job, index) => {
                const chapter = chapters?.find(c => c.id === job.chapterId);
                return (
                  <Button key={job.id} variant="outline" size="sm" asChild className="gap-2">
                    <a href={`/api/audiobooks/jobs/${job.id}/download`} data-testid={`download-final-${job.id}`}>
                      <Download className="h-4 w-4" />
                      {chapter?.title || `Capítulo ${index + 1}`}
                    </a>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showIVooxDialog} onOpenChange={setShowIVooxDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-orange-500" />
              Metadatos para iVoox
            </DialogTitle>
            <DialogDescription>
              Usa estos metadatos optimizados para publicar tu audiolibro en iVoox con estrategia freemium
            </DialogDescription>
          </DialogHeader>

          {ivooxData && (
            <Tabs defaultValue="program" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="program" data-testid="tab-ivoox-program">Programa</TabsTrigger>
                <TabsTrigger value="chapters" data-testid="tab-ivoox-chapters">Capítulos</TabsTrigger>
                <TabsTrigger value="guide" data-testid="tab-ivoox-guide">Guía</TabsTrigger>
              </TabsList>

              <TabsContent value="program" className="space-y-4 mt-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Título del Programa</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => copyToClipboard(ivooxData.metadata.programTitle, "Título")}
                        data-testid="button-copy-program-title"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="p-3 rounded-md bg-muted text-sm">
                      {ivooxData.metadata.programTitle}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">Descripción del Programa</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => copyToClipboard(ivooxData.metadata.programDescription, "Descripción")}
                        data-testid="button-copy-program-description"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <Textarea 
                      value={ivooxData.metadata.programDescription} 
                      readOnly 
                      className="min-h-[100px] resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      <Label className="text-sm font-medium">Etiquetas</Label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ivooxData.metadata.programTags.map((tag, i) => (
                        <Badge 
                          key={i} 
                          variant="secondary" 
                          className="cursor-pointer"
                          onClick={() => copyToClipboard(tag, "Etiqueta")}
                          data-testid={`badge-tag-${i}`}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Euro className="h-4 w-4" />
                        Precio Suscripción
                      </Label>
                      <div className="p-3 rounded-md bg-muted text-lg font-bold">
                        €{ivooxData.metadata.subscriptionPrice.toFixed(2)}/mes
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Capítulos Gratis</Label>
                      <div className="p-3 rounded-md bg-muted text-lg font-bold">
                        {ivooxData.metadata.freeChaptersCount} capítulos
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">CTA para Capítulos Gratis</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => copyToClipboard(ivooxData.metadata.freeAccessCTA, "CTA Gratis")}
                        data-testid="button-copy-free-cta"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30 text-sm">
                      {ivooxData.metadata.freeAccessCTA}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">CTA para Capítulos de Pago</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => copyToClipboard(ivooxData.metadata.paidAccessCTA, "CTA Pago")}
                        data-testid="button-copy-paid-cta"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="p-3 rounded-md bg-orange-500/10 border border-orange-500/30 text-sm">
                      {ivooxData.metadata.paidAccessCTA}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="chapters" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {ivooxData.chapters.map((chapter) => (
                      <Card key={chapter.chapterNumber} className={chapter.isExclusiveForFans ? "border-orange-500/30" : "border-green-500/30"}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm font-medium">
                              Capítulo {chapter.chapterNumber}: {chapter.title}
                            </CardTitle>
                            <Badge variant={chapter.isExclusiveForFans ? "secondary" : "default"} className="shrink-0">
                              {chapter.accessLabel}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">Título del Episodio</Label>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6"
                                onClick={() => copyToClipboard(chapter.formattedTitle, `Título Cap. ${chapter.chapterNumber}`)}
                                data-testid={`button-copy-chapter-title-${chapter.chapterNumber}`}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="p-2 rounded-md bg-muted text-xs">
                              {chapter.formattedTitle}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">Descripción</Label>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6"
                                onClick={() => copyToClipboard(chapter.formattedDescription, `Descripción Cap. ${chapter.chapterNumber}`)}
                                data-testid={`button-copy-chapter-desc-${chapter.chapterNumber}`}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="p-2 rounded-md bg-muted text-xs whitespace-pre-wrap">
                              {chapter.formattedDescription}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="guide" className="mt-4">
                <ScrollArea className="h-[400px]">
                  <div className="p-4 rounded-md bg-muted text-sm whitespace-pre-wrap font-sans">
                    {ivooxData.publishingGuide || "No se pudo generar la guía"}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowIVooxDialog(false)} data-testid="button-close-ivoox">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewProjectDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [ttsProvider, setTtsProvider] = useState<TTSProvider>("polly");
  const [engine, setEngine] = useState<string>("");
  const [voiceId, setVoiceId] = useState("");
  const [speechRate, setSpeechRate] = useState("75%");
  const [uploading, setUploading] = useState(false);

  // Query para voces de Amazon Polly
  const { data: pollyVoices, isLoading: loadingPollyVoices } = useQuery<Voice[]>({
    queryKey: ["/api/audiobooks/voices"],
    enabled: open && ttsProvider === "polly",
  });

  // Query para status de Google TTS
  const { data: googleStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/audiobooks/google-status"],
    enabled: open,
  });

  // Query para voces de Google TTS
  const { data: googleVoicesData, isLoading: loadingGoogleVoices } = useQuery<{ configured: boolean; voices: GoogleVoice[] }>({
    queryKey: ["/api/audiobooks/google-voices"],
    enabled: open && ttsProvider === "google" && googleStatus?.configured,
  });

  const googleVoices = googleVoicesData?.voices || [];
  const isGoogleConfigured = googleStatus?.configured ?? false;

  // Motores disponibles según el proveedor
  const availableEngines = ttsProvider === "polly"
    ? pollyVoices ? Array.from(new Set(pollyVoices.map(v => v.engine))).sort() : []
    : googleVoices ? Array.from(new Set(googleVoices.map(v => v.voiceType))).sort() : [];

  // Voces filtradas según proveedor y motor
  const filteredVoices = ttsProvider === "polly"
    ? pollyVoices?.filter(v => !engine || v.engine === engine) || []
    : googleVoices?.filter(v => !engine || v.voiceType === engine) || [];

  const loadingVoices = ttsProvider === "polly" ? loadingPollyVoices : loadingGoogleVoices;

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      if (!title) {
        setTitle(f.name.replace(/\.docx?$/i, ""));
      }
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/epub+zip": [".epub"],
      "application/zip": [".epub"],
      "text/plain": [".txt"],
    },
    maxFiles: 1,
  });

  const handleSubmit = async () => {
    if (!file || !title || !author || !voiceId) {
      toast({ title: "Campos requeridos", description: "Por favor completa todos los campos", variant: "destructive" });
      return;
    }

    // Validar tamaño del archivo (máx 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "Archivo muy grande", description: "El archivo no debe exceder 50MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("author", author);
      formData.append("voiceId", voiceId);

      // Determinar locale según proveedor
      if (ttsProvider === "polly") {
        const selectedVoice = pollyVoices?.find(v => v.id === voiceId && v.engine === engine);
        if (selectedVoice) {
          formData.append("voiceLocale", selectedVoice.languageCode);
        }
      } else {
        const selectedVoice = googleVoices?.find(v => v.id === voiceId);
        if (selectedVoice) {
          formData.append("voiceLocale", selectedVoice.languageCode);
        }
      }
      formData.append("engine", engine);
      formData.append("speechRate", speechRate);
      formData.append("ttsProvider", ttsProvider);

      // Usar apiRequest para mejor manejo de errores y timeouts
      const response = await apiRequest("POST", "/api/audiobooks/upload", formData);
      const data = await response.json();
      
      toast({ title: "Proyecto creado", description: "El archivo ha sido procesado correctamente" });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects"] });
      setOpen(false);
      setFile(null);
      setTitle("");
      setAuthor("");
      setTtsProvider("polly");
      setEngine("");
      setVoiceId("");
      setSpeechRate("75%");
      onSuccess();
    } catch (error: any) {
      const errorMsg = error instanceof Error ? error.message : "Error desconocido al subir el archivo";
      console.error("Upload error:", error);
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectedVoice = ttsProvider === "polly"
    ? pollyVoices?.find(v => v.id === voiceId && v.engine === engine)
    : googleVoices?.find(v => v.id === voiceId && v.voiceType === engine);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-new-audiobook-project" className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Proyecto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo Proyecto de Audiolibro</DialogTitle>
          <DialogDescription>
            Sube un archivo Word (.docx), EPUB (.epub) o texto (.txt) con capítulos separados por encabezados H1
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
              ${file ? "bg-muted/50" : ""}`}
            data-testid="dropzone-upload"
          >
            <input {...getInputProps()} data-testid="input-file-upload" />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Arrastra un archivo aquí o haz clic para seleccionar</p>
                <p className="text-xs text-muted-foreground mt-1">Archivos: .docx, .doc, .epub, .txt</p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Título del libro</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Mi Gran Novela"
              data-testid="input-project-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Autor</Label>
            <Input
              id="author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Ej: Juan Pérez"
              data-testid="input-project-author"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">Proveedor de voz</Label>
            <Select 
              value={ttsProvider} 
              onValueChange={(val: TTSProvider) => { 
                setTtsProvider(val); 
                setEngine(""); 
                setVoiceId(""); 
              }}
            >
              <SelectTrigger data-testid="select-provider-trigger">
                <SelectValue placeholder="Selecciona un proveedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="polly" data-testid="provider-option-polly">
                  Amazon Polly (Generative, Neural, Long-form)
                </SelectItem>
                <SelectItem value="google" disabled={!isGoogleConfigured} data-testid="provider-option-google">
                  Google Cloud TTS (Neural2, WaveNet)
                  {!isGoogleConfigured && " - No configurado"}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ttsProvider === "polly" 
                ? "Amazon Polly ofrece voces Generative (mejor calidad) y Long-form para audiolibros."
                : isGoogleConfigured 
                  ? "Google Cloud TTS Neural2 ofrece voces naturales de alta calidad."
                  : "Configura GOOGLE_TTS_CREDENTIALS para habilitar Google Cloud TTS."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="engine">Motor de síntesis</Label>
            <Select value={engine} onValueChange={(val) => { setEngine(val); setVoiceId(""); }}>
              <SelectTrigger data-testid="select-engine-trigger">
                <SelectValue placeholder={loadingVoices ? "Cargando..." : "Selecciona un motor"} />
              </SelectTrigger>
              <SelectContent>
                {availableEngines.map((eng) => (
                  <SelectItem key={eng} value={eng} data-testid={`engine-option-${eng}`}>
                    {ttsProvider === "polly" 
                      ? (eng === "long-form" ? "Long-form (audiolibros)" : 
                         eng === "neural" ? "Neural (alta calidad)" :
                         eng === "generative" ? "Generative (mejor calidad)" : 
                         eng === "standard" ? "Standard (básico)" : eng)
                      : (eng === "Neural2" ? "Neural2 (recomendado)" :
                         eng === "Journey" ? "Journey (narrativo)" :
                         eng === "WaveNet" ? "WaveNet (alta calidad)" : eng)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ttsProvider === "polly" 
                ? (engine === "long-form" ? "Ideal para contenido narrativo largo. Solo us-east-1." :
                   engine === "neural" ? "Voces de alta calidad para contenido general." :
                   engine === "generative" ? "Máxima calidad y naturalidad. Recomendado." :
                   engine === "standard" ? "Voces básicas, menor costo." :
                   "Selecciona un motor para ver las voces disponibles.")
                : (engine === "Neural2" ? "Voces premium de Google. Alta naturalidad." :
                   engine === "Journey" ? "Optimizado para narración larga." :
                   engine === "WaveNet" ? "Voces de alta calidad basadas en redes neuronales." :
                   "Selecciona un tipo de voz para ver las opciones disponibles.")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voice">Voz {ttsProvider === "polly" ? "de Amazon Polly" : "de Google Cloud"}</Label>
            <Select value={voiceId} onValueChange={setVoiceId} disabled={!engine}>
              <SelectTrigger data-testid="select-voice-trigger">
                <SelectValue placeholder={!engine ? "Primero selecciona un motor" : "Selecciona una voz"} />
              </SelectTrigger>
              <SelectContent>
                {filteredVoices.map((voice, index) => (
                  <SelectItem key={`${voice.id}-${index}`} value={voice.id} data-testid={`voice-option-${voice.id}`}>
                    {voice.name} ({voice.languageName}) - {voice.gender}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVoice && (
              <p className="text-xs text-muted-foreground">
                Idioma: {selectedVoice.languageCode}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="speechRate">Velocidad de narración</Label>
            <Select value={speechRate} onValueChange={setSpeechRate}>
              <SelectTrigger data-testid="select-speech-rate-trigger">
                <SelectValue placeholder="Selecciona velocidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="80%" data-testid="rate-option-80">80% - Muy lenta (pausada)</SelectItem>
                <SelectItem value="85%" data-testid="rate-option-85">85% - Lenta</SelectItem>
                <SelectItem value="90%" data-testid="rate-option-90">90% - Recomendada para audiolibros (ACX)</SelectItem>
                <SelectItem value="95%" data-testid="rate-option-95">95% - Normal-lenta</SelectItem>
                <SelectItem value="100%" data-testid="rate-option-100">100% - Normal</SelectItem>
                <SelectItem value="110%" data-testid="rate-option-110">110% - Rápida</SelectItem>
                <SelectItem value="120%" data-testid="rate-option-120">120% - Muy rápida</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              ACX recomienda 90% para mejor comprensión. Más lento = más fácil de seguir para el oyente.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!file || !title || !author || !voiceId || uploading} data-testid="button-create-project">
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Crear Proyecto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AudiobookProjects() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<AudiobookProject | null>(null);
  const { toast } = useToast();
  
  const { data: projects, isLoading } = useQuery<AudiobookProject[]>({
    queryKey: ["/api/audiobooks/projects"],
  });

  const deleteFromListMutation = useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest("DELETE", `/api/audiobooks/projects/${projectId}`);
    },
    onSuccess: () => {
      toast({ title: "Proyecto eliminado" });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects"] });
      setProjectToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "No se pudo eliminar el proyecto", variant: "destructive" });
    },
  });

  if (selectedProjectId !== null) {
    return (
      <ProjectDetail 
        projectId={selectedProjectId} 
        onBack={() => setSelectedProjectId(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" data-testid="text-audiobook-title">Proyectos de Audiolibros</h2>
          <p className="text-muted-foreground">
            Gestiona tus proyectos de conversión de texto a audio con Amazon Polly
          </p>
        </div>
        <NewProjectDialog onSuccess={() => {}} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects && projects.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const status = statusConfig[project.status] || statusConfig.draft;
            const StatusIcon = status.icon;
            const isProcessing = project.status === "synthesizing" || project.status === "mastering";
            const progress = (project.totalChapters || 0) > 0 
              ? ((project.completedChapters || 0) / (project.totalChapters || 1)) * 100 
              : 0;
            
            return (
              <Card 
                key={project.id} 
                className="hover-elevate cursor-pointer group" 
                onClick={() => setSelectedProjectId(project.id)}
                data-testid={`card-audiobook-project-${project.id}`}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-lg truncate">{project.title}</CardTitle>
                    <CardDescription className="truncate">{project.author}</CardDescription>
                  </div>
                  <Badge variant={status.variant} className="gap-1 shrink-0">
                    <StatusIcon className={`h-3 w-3 ${isProcessing ? "animate-spin" : ""}`} />
                    {status.label}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FileAudio className="h-4 w-4" />
                      <span>{project.completedChapters || 0}/{project.totalChapters || 0} capítulos</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Headphones className="h-4 w-4" />
                      <span>{project.voiceId}</span>
                    </div>
                  </div>
                  {isProcessing && (
                    <Progress value={progress} className="h-1.5" />
                  )}
                </CardContent>
                <CardFooter className="pt-0">
                  <div className="flex items-center justify-between w-full text-xs text-muted-foreground">
                    <span>{project.sourceFileName}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectToDelete(project);
                        }}
                        disabled={isProcessing}
                        data-testid={`button-delete-project-${project.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                      <ChevronRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Headphones className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay proyectos de audiolibros</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Crea tu primer proyecto de audiolibro subiendo un archivo Word (.docx), EPUB (.epub) o texto (.txt) con capítulos separados por encabezados H1.
            </p>
            <NewProjectDialog onSuccess={() => {}} />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              ¿Eliminar proyecto?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el proyecto 
              "<span className="font-medium">{projectToDelete?.title}</span>" junto con todos sus 
              capítulos y archivos de audio generados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-list">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => projectToDelete && deleteFromListMutation.mutate(projectToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-list"
            >
              {deleteFromListMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
