import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CopyButtonProps {
  text: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function CopyButton({
  text,
  label = "Copiar",
  variant = "outline",
  size = "sm",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({
        title: "Copiado al portapapeles",
        description: "El contenido ha sido copiado exitosamente",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Error al copiar",
        description: "Por favor intenta nuevamente",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleCopy}
      data-testid="button-copy"
      className="transition-all duration-200"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 mr-1.5" />
          ¡Copiado!
        </>
      ) : (
        <>
          <Copy className="h-4 w-4 mr-1.5" />
          {label}
        </>
      )}
    </Button>
  );
}
