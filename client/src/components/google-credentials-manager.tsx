import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Key, Copy, Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface GoogleCredential {
  id: number;
  label: string;
  projectId: string | null;
  clientEmail: string | null;
  status: "pending" | "valid" | "invalid";
  statusMessage: string | null;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MasterKeyStatus {
  masterKeyConfigured: boolean;
  generatedKey?: string;
}

const addCredentialSchema = z.object({
  label: z.string().min(1, "La etiqueta es requerida"),
  jsonPayload: z.string().min(1, "Las credenciales JSON son requeridas"),
});

type AddCredentialForm = z.infer<typeof addCredentialSchema>;

export function GoogleCredentialsManager() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [validatingId, setValidatingId] = useState<number | null>(null);

  const form = useForm<AddCredentialForm>({
    resolver: zodResolver(addCredentialSchema),
    defaultValues: {
      label: "",
      jsonPayload: "",
    },
  });

  const { data: statusData, isLoading: isLoadingStatus } = useQuery<MasterKeyStatus>({
    queryKey: ["/api/audiobooks/google-credentials/status"],
  });

  const { data: credentials, isLoading: isLoadingCredentials } = useQuery<GoogleCredential[]>({
    queryKey: ["/api/audiobooks/google-credentials"],
    enabled: statusData?.masterKeyConfigured === true,
  });

  const addCredentialMutation = useMutation({
    mutationFn: async (data: AddCredentialForm) => {
      const res = await apiRequest("POST", "/api/audiobooks/google-credentials", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Credencial añadida",
        description: "La credencial de Google TTS se ha añadido correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/google-credentials"] });
      setIsAddDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo añadir la credencial.",
        variant: "destructive",
      });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async (id: number) => {
      setValidatingId(id);
      const res = await apiRequest("POST", `/api/audiobooks/google-credentials/${id}/validate`);
      return await res.json() as { valid: boolean; message: string };
    },
    onSuccess: (data: { valid: boolean; message: string }) => {
      toast({
        title: data.valid ? "Credencial válida" : "Credencial inválida",
        description: data.message,
        variant: data.valid ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/google-credentials"] });
      setValidatingId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error de validación",
        description: error.message,
        variant: "destructive",
      });
      setValidatingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/audiobooks/google-credentials/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Credencial eliminada",
        description: "La credencial de Google TTS se ha eliminado.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/audiobooks/google-credentials"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la credencial.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: AddCredentialForm) => {
    addCredentialMutation.mutate(data);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado",
      description: "Clave copiada al portapapeles.",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Válida
          </Badge>
        );
      case "invalid":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Inválida
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <AlertCircle className="w-3 h-3 mr-1" />
            Pendiente
          </Badge>
        );
    }
  };

  if (isLoadingStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!statusData?.masterKeyConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Configuración de Seguridad Requerida
          </CardTitle>
          <CardDescription>
            Para almacenar credenciales de Google Cloud de forma segura, necesitas configurar una clave maestra de cifrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg space-y-3">
            <p className="text-sm font-medium">Añade esta variable de entorno a los Secrets:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-background rounded text-xs font-mono break-all">
                GOOGLE_TTS_MASTER_KEY=
                {showMasterKey ? statusData?.generatedKey : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMasterKey(!showMasterKey)}
                data-testid="button-toggle-master-key"
              >
                {showMasterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(`GOOGLE_TTS_MASTER_KEY=${statusData?.generatedKey}`)}
                data-testid="button-copy-master-key"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta clave de 64 caracteres hexadecimales se usa para cifrar las credenciales de Google Cloud con AES-256-GCM.
              Guárdala en un lugar seguro. Si la pierdes, tendrás que volver a añadir todas las credenciales.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            data-testid="button-refresh-after-key"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Ya configuré la clave, recargar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Credenciales de Google Cloud TTS</CardTitle>
          <CardDescription>
            Gestiona múltiples cuentas de servicio de Google Cloud para síntesis de voz.
          </CardDescription>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-credential">
              <Plus className="w-4 h-4 mr-2" />
              Añadir Credencial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Añadir Credencial de Google Cloud</DialogTitle>
              <DialogDescription>
                Pega el contenido JSON de la cuenta de servicio de Google Cloud.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etiqueta</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="ej: Cuenta Principal, Backup, Proyecto X..." 
                          {...field}
                          data-testid="input-credential-label"
                        />
                      </FormControl>
                      <FormDescription>
                        Un nombre descriptivo para identificar esta credencial.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="jsonPayload"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Credenciales JSON</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='{"type": "service_account", "project_id": "...", ...}'
                          className="font-mono text-xs min-h-[200px]"
                          {...field}
                          data-testid="textarea-credential-json"
                        />
                      </FormControl>
                      <FormDescription>
                        El archivo JSON completo de la cuenta de servicio descargado de Google Cloud Console.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsAddDialogOpen(false)}
                    data-testid="button-cancel-add"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={addCredentialMutation.isPending}
                    data-testid="button-submit-credential"
                  >
                    {addCredentialMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Añadir y Validar
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoadingCredentials ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : credentials && credentials.length > 0 ? (
          <div className="space-y-3">
            {credentials.map((credential) => (
              <div
                key={credential.id}
                className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                data-testid={`card-credential-${credential.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{credential.label}</span>
                    {getStatusBadge(credential.status)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {credential.projectId && (
                      <span>Proyecto: {credential.projectId}</span>
                    )}
                    {credential.clientEmail && (
                      <span className="ml-3 text-xs">({credential.clientEmail})</span>
                    )}
                  </div>
                  {credential.statusMessage && credential.status === "invalid" && (
                    <p className="text-xs text-destructive mt-1">{credential.statusMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => validateMutation.mutate(credential.id)}
                    disabled={validatingId === credential.id}
                    data-testid={`button-validate-${credential.id}`}
                  >
                    {validatingId === credential.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(credential.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${credential.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No hay credenciales de Google Cloud configuradas.</p>
            <p className="text-sm mt-1">
              Añade una cuenta de servicio para usar Google Cloud Text-to-Speech.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
