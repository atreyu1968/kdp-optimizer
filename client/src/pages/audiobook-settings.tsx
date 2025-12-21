import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Key, Cloud, HardDrive, AlertTriangle, Info, Mail, ExternalLink, Server, Lock } from "lucide-react";

interface AwsCredentialsStatus {
  hasAccessKeyId: boolean;
  hasSecretAccessKey: boolean;
  hasRegion: boolean;
  hasBucketName: boolean;
  allConfigured: boolean;
}

export default function AudiobookSettings() {
  const { data: credentialsStatus, isLoading } = useQuery<AwsCredentialsStatus>({
    queryKey: ["/api/audiobooks/settings/status"],
  });

  const credentials = [
    {
      key: "AWS_ACCESS_KEY_ID",
      label: "AWS Access Key ID",
      description: "Identificador de clave de acceso de AWS",
      icon: Key,
      configured: credentialsStatus?.hasAccessKeyId,
    },
    {
      key: "AWS_SECRET_ACCESS_KEY",
      label: "AWS Secret Access Key",
      description: "Clave de acceso secreta de AWS",
      icon: Key,
      configured: credentialsStatus?.hasSecretAccessKey,
    },
    {
      key: "AWS_REGION",
      label: "AWS Region",
      description: "Región de AWS (ej: us-east-1)",
      icon: Cloud,
      configured: credentialsStatus?.hasRegion,
    },
    {
      key: "S3_BUCKET_NAME",
      label: "S3 Bucket Name",
      description: "Nombre del bucket S3 para almacenamiento temporal",
      icon: HardDrive,
      configured: credentialsStatus?.hasBucketName,
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">Configuración de AWS</h2>
        <p className="text-muted-foreground">
          Configura las credenciales de AWS necesarias para usar Amazon Polly y S3
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Credenciales seguras</AlertTitle>
        <AlertDescription>
          Las credenciales de AWS se almacenan de forma segura como variables de entorno (Secrets) en Replit. 
          Esta página solo verifica si están configuradas, pero nunca las muestra ni las almacena en la base de datos.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Estado de Credenciales AWS
          </CardTitle>
          <CardDescription>
            Verifica que todas las credenciales necesarias estén configuradas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {credentials.map((cred) => {
                const Icon = cred.icon;
                return (
                  <div
                    key={cred.key}
                    className="flex items-center justify-between p-3 rounded-lg border"
                    data-testid={`credential-status-${cred.key.toLowerCase().replace(/_/g, '-')}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-8 w-8 rounded bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{cred.label}</p>
                        <p className="text-xs text-muted-foreground">{cred.description}</p>
                      </div>
                    </div>
                    <Badge variant={cred.configured ? "default" : "destructive"} className="gap-1">
                      {cred.configured ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {cred.configured ? "Configurado" : "No configurado"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && !credentialsStatus?.allConfigured && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Configuración incompleta</AlertTitle>
              <AlertDescription>
                Algunas credenciales de AWS no están configuradas. Para configurarlas:
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Abre la pestaña "Secrets" en el panel izquierdo de Replit</li>
                  <li>Añade cada variable de entorno que falte con su valor correspondiente</li>
                  <li>Recarga la página para verificar la configuración</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}

          {!isLoading && credentialsStatus?.allConfigured && (
            <Alert className="mt-4 border-green-500/50 bg-green-500/10">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-green-700 dark:text-green-400">Configuración completa</AlertTitle>
              <AlertDescription className="text-green-600 dark:text-green-300">
                Todas las credenciales de AWS están configuradas correctamente. 
                Ya puedes crear y sintetizar proyectos de audiolibros.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Requisitos de AWS</CardTitle>
          <CardDescription>
            Permisos necesarios para la cuenta de AWS
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm space-y-2">
            <p>El usuario de AWS debe tener los siguientes permisos:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong>Amazon Polly:</strong> polly:StartSpeechSynthesisTask, polly:GetSpeechSynthesisTask, polly:DescribeVoices</li>
              <li><strong>Amazon S3:</strong> s3:PutObject, s3:GetObject, s3:DeleteObject en el bucket especificado</li>
            </ul>
          </div>
          <div className="text-sm space-y-2">
            <p className="font-medium">Notas sobre el motor "long-form":</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Solo disponible en la región <strong>us-east-1</strong></li>
              <li>Voces compatibles: Sergio (es-ES), Joanna, Matthew, Ruth, Stephen, Amy (en-US/en-GB)</li>
              <li>Ideal para contenido narrativo largo (audiolibros)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
