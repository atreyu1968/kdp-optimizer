import { AuraImport } from "@/components/aura-import";

export default function AuraImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Importar Datos</h2>
        <p className="text-muted-foreground">
          Sube tus archivos XLSX de KDP Dashboard
        </p>
      </div>

      <AuraImport />
    </div>
  );
}
