import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuraSales() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Ventas</h2>
        <p className="text-muted-foreground">
          Registro completo de transacciones
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registro de Ventas</CardTitle>
          <CardDescription>
            Historial completo de transacciones
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Tabla de ventas en desarrollo...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
