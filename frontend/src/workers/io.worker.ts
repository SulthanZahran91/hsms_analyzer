/// <reference lib="webworker" />

interface IOMessage {
  type: 'fetch';
  url: string;
  headers?: Record<string, string>;
}

interface IOResult {
  type: 'success' | 'error';
  buffer?: ArrayBuffer;
  error?: string;
}

self.onmessage = async (e: MessageEvent<IOMessage>) => {
  const { type, url, headers } = e.data;

  if (type === 'fetch') {
    try {
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        self.postMessage({
          type: 'error',
          error: `HTTP ${response.status}: ${response.statusText}`,
        } as IOResult);
        return;
      }

      const buffer = await response.arrayBuffer();
      
      // Transfer the buffer to main thread (zero-copy)
      self.postMessage(
        {
          type: 'success',
          buffer,
        } as IOResult,
        [buffer]
      );
    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      } as IOResult);
    }
  }
};

export {};

