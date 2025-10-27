import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuraPenNames() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Seudónimos</h2>
        <p className="text-muted-foreground">
          Gestiona tus identidades de autor
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gestión de Seudónimos</CardTitle>
          <CardDescription>
            Administra tus identidades de autor
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Lista de seudónimos en desarrollo...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
