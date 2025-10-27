import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AuraBooks() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Libros</h2>
        <p className="text-muted-foreground">
          Catálogo de tus libros publicados
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo de Libros</CardTitle>
          <CardDescription>
            Todos tus libros publicados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Catálogo de libros en desarrollo...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
