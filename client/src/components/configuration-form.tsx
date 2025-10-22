import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { optimizationRequestSchema, amazonMarkets, bookGenres } from "@shared/schema";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const configFormSchema = optimizationRequestSchema.omit({
  manuscriptText: true,
});

type ConfigFormData = z.infer<typeof configFormSchema>;

interface ConfigurationFormProps {
  onSubmit: (data: ConfigFormData) => void;
  isProcessing?: boolean;
}

export function ConfigurationForm({
  onSubmit,
  isProcessing,
}: ConfigurationFormProps) {
  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      originalTitle: "",
      author: "",
      language: "",
      targetMarkets: [],
      genre: "",
      targetAudience: "",
      seriesName: "",
      seriesNumber: undefined,
    },
  });

  const selectedMarkets = form.watch("targetMarkets");
  const seriesName = form.watch("seriesName");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full max-w-3xl mx-auto space-y-8"
      >
        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="originalTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Título del Libro
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ingresa el título original"
                    {...field}
                    data-testid="input-title"
                    className="text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="author"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Nombre del Autor
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="Nombre del autor"
                    {...field}
                    data-testid="input-author"
                    className="text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Idioma Principal
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-language">
                      <SelectValue placeholder="Selecciona idioma" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="en">Inglés</SelectItem>
                    <SelectItem value="es">Español</SelectItem>
                    <SelectItem value="ca">Catalán</SelectItem>
                    <SelectItem value="de">Alemán</SelectItem>
                    <SelectItem value="fr">Francés</SelectItem>
                    <SelectItem value="it">Italiano</SelectItem>
                    <SelectItem value="pt">Portugués</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="genre"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Género
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-genre">
                      <SelectValue placeholder="Selecciona género" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {bookGenres.map((genre) => (
                      <SelectItem key={genre} value={genre}>
                        {genre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="targetAudience"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Audiencia Objetivo (Opcional)
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="ej., Jóvenes Adultos"
                    {...field}
                    data-testid="input-audience"
                    className="text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="seriesName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Nombre de la Serie (Opcional)
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="ej., Las Crónicas del Reino"
                    {...field}
                    data-testid="input-series-name"
                    className="text-base"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Si es parte de una serie
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {seriesName && (
          <FormField
            control={form.control}
            name="seriesNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Número en la Serie
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    placeholder="ej., 1, 2, 3..."
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value ? parseInt(value, 10) : undefined);
                    }}
                    value={field.value ?? ""}
                    data-testid="input-series-number"
                    className="text-base"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  ¿Qué número es este libro en la serie?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="targetMarkets"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Mercados Objetivo
                </FormLabel>
                <FormDescription className="text-xs mt-1">
                  Selecciona los mercados de Amazon que quieres optimizar
                </FormDescription>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {Object.entries(amazonMarkets).map(([id, market]) => (
                  <FormField
                    key={id}
                    control={form.control}
                    name="targetMarkets"
                    render={({ field }) => (
                      <FormItem key={id}>
                        <FormControl>
                          <label
                            className={`
                              flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer
                              transition-all duration-200
                              ${
                                field.value?.includes(id)
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/50 hover-elevate"
                              }
                            `}
                            data-testid={`checkbox-market-${id}`}
                          >
                            <Checkbox
                              checked={field.value?.includes(id)}
                              onCheckedChange={(checked) => {
                                const current = field.value || [];
                                const updated = checked
                                  ? [...current, id]
                                  : current.filter((value) => value !== id);
                                field.onChange(updated);
                              }}
                            />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl">{market.flag}</span>
                                <span className="font-medium text-sm">
                                  {market.name}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {market.currency}
                              </div>
                            </div>
                          </label>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            {selectedMarkets.length > 0 && (
              <span>
                {selectedMarkets.length} mercado{selectedMarkets.length !== 1 ? "s" : ""} seleccionado{selectedMarkets.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={isProcessing}
            data-testid="button-generate-metadata"
            className="px-8"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                Procesando...
              </>
            ) : (
              "Generar Metadatos"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
