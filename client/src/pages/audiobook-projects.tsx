import { useState, useCallback } from "react";
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
  RefreshCw, ChevronRight, AlertTriangle
} from "lucide-react";
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

interface Voice {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  engine: string;
}

interface ProjectDetailProps {
  projectId: number;
  onBack: () => void;
}

function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: project, isLoading: loadingProject } = useQuery<AudiobookProject>({
    queryKey: ["/api/audiobooks/projects", projectId],
  });

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
  const completedCount = jobs?.filter(j => j.status === "completed" || j.status === "mastered").length || 0;
  const totalJobs = jobs?.length || 0;
  const progress = totalJobs > 0 ? (completedCount / totalJobs) * 100 : 0;

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
          {isProcessing && (
            <Button variant="outline" size="sm" onClick={() => refetchJobs()} data-testid="button-refresh-status">
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
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
              <span>Capítulos procesados</span>
              <span className="font-medium">{completedCount} / {totalJobs}</span>
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
              <Badge variant="outline">{project.engine}</Badge>
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
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            ~{Math.ceil((chapter.estimatedDurationSeconds || 0) / 60)} min
                          </span>
                          {jobStatus && (
                            <Badge variant={jobStatus.variant} className="gap-1 text-xs">
                              {JobIcon && <JobIcon className={`h-3 w-3 ${job?.status === "processing" || job?.status === "submitted" ? "animate-spin" : ""}`} />}
                              {jobStatus.label}
                            </Badge>
                          )}
                          {job?.finalAudioUrl && (
                            <Button variant="ghost" size="icon" asChild className="h-6 w-6">
                              <a href={job.finalAudioUrl} target="_blank" rel="noopener noreferrer" data-testid={`download-chapter-${chapter.id}`}>
                                <Download className="h-3 w-3" />
                              </a>
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
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {jobs.filter(j => j.finalAudioUrl).map((job, index) => {
                const chapter = chapters?.find(c => c.id === job.chapterId);
                return (
                  <Button key={job.id} variant="outline" size="sm" asChild className="gap-2">
                    <a href={job.finalAudioUrl!} download data-testid={`download-final-${job.id}`}>
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
    </div>
  );
}

function NewProjectDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [engine, setEngine] = useState<string>("");
  const [voiceId, setVoiceId] = useState("");
  const [speechRate, setSpeechRate] = useState("90%"); // ACX default: 90% for better comprehension
  const [uploading, setUploading] = useState(false);

  const { data: voices, isLoading: loadingVoices } = useQuery<Voice[]>({
    queryKey: ["/api/audiobooks/voices"],
    enabled: open,
  });

  const availableEngines = voices 
    ? Array.from(new Set(voices.map(v => v.engine))).sort()
    : [];

  const filteredVoices = voices?.filter(v => !engine || v.engine === engine) || [];

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
    },
    maxFiles: 1,
  });

  const handleSubmit = async () => {
    if (!file || !title || !author || !voiceId) {
      toast({ title: "Campos requeridos", description: "Por favor completa todos los campos", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title);
      formData.append("author", author);
      formData.append("voiceId", voiceId);

      const selectedVoice = voices?.find(v => v.id === voiceId);
      if (selectedVoice) {
        formData.append("voiceLocale", selectedVoice.languageCode);
        formData.append("engine", selectedVoice.engine);
      }
      formData.append("speechRate", speechRate);

      const response = await fetch("/api/audiobooks/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al subir el archivo");
      }

      toast({ title: "Proyecto creado", description: "El archivo ha sido procesado correctamente" });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/projects"] });
      setOpen(false);
      setFile(null);
      setTitle("");
      setAuthor("");
      setEngine("");
      setVoiceId("");
      setSpeechRate("90%");
      onSuccess();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const selectedVoice = voices?.find(v => v.id === voiceId);

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
            Sube un archivo Word (.docx) con capítulos separados por encabezados H1
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
                <p className="text-xs text-muted-foreground mt-1">Solo archivos .docx</p>
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
            <Label htmlFor="engine">Motor de síntesis</Label>
            <Select value={engine} onValueChange={(val) => { setEngine(val); setVoiceId(""); }}>
              <SelectTrigger data-testid="select-engine-trigger">
                <SelectValue placeholder={loadingVoices ? "Cargando..." : "Selecciona un motor"} />
              </SelectTrigger>
              <SelectContent>
                {availableEngines.map((eng) => (
                  <SelectItem key={eng} value={eng} data-testid={`engine-option-${eng}`}>
                    {eng === "long-form" ? "Long-form (audiolibros)" : 
                     eng === "neural" ? "Neural (alta calidad)" : 
                     eng === "standard" ? "Standard (básico)" : eng}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {engine === "long-form" ? "Ideal para contenido narrativo largo. Solo us-east-1." :
               engine === "neural" ? "Voces de alta calidad para contenido general." :
               engine === "standard" ? "Voces básicas, menor costo." :
               "Selecciona un motor para ver las voces disponibles."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voice">Voz de Amazon Polly</Label>
            <Select value={voiceId} onValueChange={setVoiceId} disabled={!engine}>
              <SelectTrigger data-testid="select-voice-trigger">
                <SelectValue placeholder={!engine ? "Primero selecciona un motor" : "Selecciona una voz"} />
              </SelectTrigger>
              <SelectContent>
                {filteredVoices.map((voice, index) => (
                  <SelectItem key={`${voice.id}-${voice.engine}-${index}`} value={voice.id} data-testid={`voice-option-${voice.id}`}>
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
              Crea tu primer proyecto de audiolibro subiendo un archivo Word (.docx) con capítulos separados por encabezados H1.
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
