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
        Price & Royalties
      </h4>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Price</TableHead>
              <TableHead>Royalty</TableHead>
              <TableHead className="text-right">Est. Earnings</TableHead>
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
          💰 Pricing Strategy:
        </p>
        <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
          <li>
            {royaltyOption === "70%"
              ? "70% royalty option maximizes earnings for most authors"
              : "35% royalty allows pricing flexibility outside standard range"}
          </li>
          <li>Price ends in .99 for psychological appeal</li>
          <li>Competitive for {marketName} market</li>
          <li>Estimated earnings per sale (after delivery costs)</li>
        </ul>
      </div>
    </div>
  );
}
