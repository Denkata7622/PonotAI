declare module "@google/generative-ai" {
  export const HarmCategory: {
    HARM_CATEGORY_HARASSMENT: string;
    HARM_CATEGORY_HATE_SPEECH: string;
  };

  export const HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: string;
  };

  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(config: Record<string, unknown>): {
      startChat(config: Record<string, unknown>): {
        sendMessage(message: string): Promise<{
          response: {
            text(): string;
            usageMetadata?: {
              promptTokenCount?: number;
              candidatesTokenCount?: number;
              totalTokenCount?: number;
            };
          };
        }>;
      };
    };
  }
}
