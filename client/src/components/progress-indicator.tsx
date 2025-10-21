import { Check } from "lucide-react";

interface ProgressIndicatorProps {
  currentStep: number;
}

const steps = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Configure" },
  { id: 3, label: "Analyze" },
  { id: 4, label: "Results" },
];

export function ProgressIndicator({ currentStep }: ProgressIndicatorProps) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="flex items-center justify-between relative">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isUpcoming = currentStep < step.id;

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  transition-all duration-300 border-2
                  ${
                    isCompleted
                      ? "bg-chart-2 border-chart-2 text-white"
                      : isCurrent
                      ? "bg-primary border-primary text-white"
                      : "bg-background border-muted-foreground/30 text-muted-foreground"
                  }
                `}
                data-testid={`step-${step.id}`}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-semibold">{step.id}</span>
                )}
              </div>
              <span
                className={`
                  mt-2 text-xs font-medium
                  ${
                    isCompleted || isCurrent
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                `}
              >
                {step.label}
              </span>

              {index < steps.length - 1 && (
                <div
                  className={`
                    absolute top-5 left-full w-full h-0.5 -translate-y-1/2
                    transition-all duration-300
                    ${
                      currentStep > step.id
                        ? "bg-chart-2"
                        : "bg-muted-foreground/30"
                    }
                  `}
                  style={{ width: "calc(100% - 2.5rem)" }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
