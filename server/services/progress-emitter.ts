import { Response } from "express";

export class ProgressEmitter {
  private res: Response | null = null;
  private closed = false;

  hasConnection(): boolean {
    return this.res !== null && !this.closed;
  }

  setResponse(res: Response) {
    this.res = res;
    this.res.setHeader("Content-Type", "text/event-stream");
    this.res.setHeader("Cache-Control", "no-cache");
    this.res.setHeader("Connection", "keep-alive");
    this.res.setHeader("X-Accel-Buffering", "no");
    
    res.on("close", () => {
      this.closed = true;
      this.res = null;
    });
  }

  emit(stage: string, message: string, progress: number, currentMarket?: string) {
    if (this.closed || !this.res) return;

    const data = {
      stage,
      message,
      progress,
      currentMarket,
    };

    this.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  complete(data?: any) {
    if (this.closed || !this.res) return;
    if (data) {
      this.res.write(`event: complete\ndata: ${JSON.stringify(data)}\n\n`);
    }
    this.res.end();
    this.closed = true;
  }
}
