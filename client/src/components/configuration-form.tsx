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
      language: "",
      targetMarkets: [],
      genre: "",
      targetAudience: "",
    },
  });

  const selectedMarkets = form.watch("targetMarkets");

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full max-w-3xl mx-auto space-y-8"
      >
        <FormField
          control={form.control}
          name="originalTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium uppercase tracking-wide">
                Book Title
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter your book's original title"
                  {...field}
                  data-testid="input-title"
                  className="text-base"
                />
              </FormControl>
              <FormDescription className="text-xs">
                This title will be kept as the base for all markets
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="language"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Primary Language
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="it">Italian</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
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
                  Genre
                </FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-genre">
                      <SelectValue placeholder="Select genre" />
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

        <FormField
          control={form.control}
          name="targetAudience"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium uppercase tracking-wide">
                Target Audience (Optional)
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Young Adults, Business Professionals"
                  {...field}
                  data-testid="input-audience"
                  className="text-base"
                />
              </FormControl>
              <FormDescription className="text-xs">
                Help the AI understand your ideal reader
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="targetMarkets"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-sm font-medium uppercase tracking-wide">
                  Target Markets
                </FormLabel>
                <FormDescription className="text-xs mt-1">
                  Select the Amazon marketplaces you want to optimize for
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
                {selectedMarkets.length} market{selectedMarkets.length !== 1 ? "s" : ""} selected
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
                Processing...
              </>
            ) : (
              "Generate Metadata"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
