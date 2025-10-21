import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PricingTableProps {
  recommendedPrice: number;
  currency: string;
  royaltyOption: "35%" | "70%";
  estimatedEarnings: number;
  marketName: string;
}

export function PricingTable({
  recommendedPrice,
  currency,
  royaltyOption,
  estimatedEarnings,
  marketName,
}: PricingTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium uppercase tracking-wide text-foreground">
        Precio y Regalías
      </h4>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Precio</TableHead>
              <TableHead>Regalía</TableHead>
              <TableHead className="text-right">Ganancia Est.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-primary/5">
              <TableCell className="font-medium" data-testid="recommended-price">
                {formatCurrency(recommendedPrice)}
              </TableCell>
              <TableCell>
                <Badge variant="default" data-testid="royalty-option">
                  {royaltyOption}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-semibold text-chart-2" data-testid="estimated-earnings">
                {formatCurrency(estimatedEarnings)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
        <p className="text-xs font-medium text-foreground">
          💰 Estrategia de Precio:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
          <li>
            {royaltyOption === "70%"
              ? "La opción de regalía del 70% maximiza las ganancias para la mayoría de autores"
              : "La regalía del 35% permite flexibilidad de precios fuera del rango estándar"}
          </li>
          <li>El precio termina en .99 por atractivo psicológico</li>
          <li>Competitivo para el mercado de {marketName}</li>
          <li>Ganancia estimada por venta (después de costos de entrega)</li>
        </ul>
      </div>
    </div>
  );
}
