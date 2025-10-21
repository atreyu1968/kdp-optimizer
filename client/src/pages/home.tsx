import { useState } from "react";
import { FileUploadZone } from "@/components/file-upload-zone";
import { ConfigurationForm } from "@/components/configuration-form";
import { LoadingOverlay } from "@/components/loading-overlay";
import { ResultsPanel } from "@/components/results-panel";
import { ProgressIndicator } from "@/components/progress-indicator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BookOpen, Sparkles } from "lucide-react";
import type { OptimizationResult, UploadProgress } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const [currentStep, setCurrentStep] = useState(1);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manuscriptText, setManuscriptText] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);

  const handleFileAccepted = (file: File, content: string) => {
    setUploadedFile(file);
    setManuscriptText(content);
    const words = content.trim().split(/\s+/).length;
    setWordCount(words);
    setCurrentStep(2);
  };

  const handleConfigSubmit = async (configData: any) => {
    setCurrentStep(3);
    
    try {
      const response = await apiRequest("POST", "/api/optimize", {
        ...configData,
        manuscriptText,
      });
      const { sessionId } = await response.json();
      
      const eventSource = new EventSource(`/api/optimize/progress/${sessionId}`);
      
      eventSource.onmessage = (event) => {
        try {
          const progressData = JSON.parse(event.data);
          if (progressData.stage === "error") {
            setProgress(null);
            setCurrentStep(2);
            alert("Error: " + progressData.message);
            eventSource.close();
            return;
          }
          setProgress(progressData as UploadProgress);
        } catch (e) {
          console.error("Failed to parse progress data:", e);
        }
      };

      eventSource.addEventListener("complete", (event) => {
        try {
          const result = JSON.parse((event as MessageEvent).data);
          setResult(result);
          setCurrentStep(4);
          setProgress(null);
        } catch (e) {
          console.error("Failed to parse result:", e);
        } finally {
          eventSource.close();
        }
      });

      eventSource.onerror = (error) => {
        console.error("EventSource error:", error);
        eventSource.close();
        setProgress(null);
      };
    } catch (error) {
      console.error("Optimization failed:", error);
      setProgress(null);
    }
  };

  const handleStartNew = () => {
    setCurrentStep(1);
    setUploadedFile(null);
    setManuscriptText("");
    setWordCount(0);
    setResult(null);
    setProgress(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {progress && <LoadingOverlay progress={progress} />}

      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                KDP Optimizer AI
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Powered by OpenAI
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        {currentStep < 4 && (
          <div className="mb-12">
            <ProgressIndicator currentStep={currentStep} />
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-3xl font-bold text-foreground">
                Optimize Your Book for Amazon KDP
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Upload your manuscript and let AI generate optimized metadata for
                multiple Amazon markets. Get titles, descriptions, keywords, and
                pricing recommendations in minutes.
              </p>
            </div>

            <FileUploadZone
              onFileAccepted={handleFileAccepted}
              acceptedFile={uploadedFile}
              wordCount={wordCount}
            />

            <div className="max-w-2xl mx-auto">
              <div className="grid sm:grid-cols-3 gap-6 text-center">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground">AI-Powered</h3>
                  <p className="text-sm text-muted-foreground">
                    Advanced analysis using GPT models
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-chart-2/10 flex items-center justify-center mx-auto">
                    <svg
                      className="h-6 w-6 text-chart-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-foreground">Multi-Market</h3>
                  <p className="text-sm text-muted-foreground">
                    Optimize for 7 Amazon markets
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-full bg-chart-3/10 flex items-center justify-center mx-auto">
                    <svg
                      className="h-6 w-6 text-chart-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold text-foreground">Fast Results</h3>
                  <p className="text-sm text-muted-foreground">
                    Complete analysis in minutes
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-3xl font-bold text-foreground">
                Configure Your Optimization
              </h2>
              <p className="text-lg text-muted-foreground">
                Tell us about your book and select your target markets
              </p>
            </div>

            <ConfigurationForm
              onSubmit={handleConfigSubmit}
            />

            <div className="flex justify-center">
              <Button
                variant="ghost"
                onClick={() => setCurrentStep(1)}
                data-testid="button-back"
              >
                ← Back to Upload
              </Button>
            </div>
          </div>
        )}

        {currentStep === 4 && result && (
          <div className="space-y-8">
            <ResultsPanel result={result} />

            <div className="flex justify-center">
              <Button
                variant="outline"
                size="lg"
                onClick={handleStartNew}
                data-testid="button-start-new"
              >
                Optimize Another Book
              </Button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-sm text-muted-foreground">
            <p>
              © {new Date().getFullYear()} KDP Optimizer AI. Built with AI to
              help authors succeed.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
