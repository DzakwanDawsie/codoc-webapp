const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// API Key management state
let currentApiKeyIndex = 0;
let allKeysExhausted = false;

interface GroqMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface GroqRequestOptions {
    messages: GroqMessage[];
    temperature?: number;
    max_tokens?: number;
}

interface GroqResponse {
    success: boolean;
    content?: string;
    error?: string;
}

// Get list of available API keys
function getApiKeys(): string[] {
    const keys: string[] = [];

    if (process.env.GROQ_API_KEY) {
        keys.push(process.env.GROQ_API_KEY);
    }
    if (process.env.GROQ_API_KEY_ALTERNATIVE_1) {
        keys.push(process.env.GROQ_API_KEY_ALTERNATIVE_1);
    }
    if (process.env.GROQ_API_KEY_ALTERNATIVE_2) {
        keys.push(process.env.GROQ_API_KEY_ALTERNATIVE_2);
    }
    if (process.env.GROQ_API_KEY_ALTERNATIVE_3) {
        keys.push(process.env.GROQ_API_KEY_ALTERNATIVE_3);
    }

    return keys;
}

// Get current API key
function getCurrentApiKey(): string | null {
    const keys = getApiKeys();
    if (keys.length === 0) return null;

    // Reset if we've cycled through all keys
    if (currentApiKeyIndex >= keys.length) {
        currentApiKeyIndex = 0;
        allKeysExhausted = true;
    }

    return keys[currentApiKeyIndex];
}

// Get key name for logging
function getCurrentKeyName(): string {
    if (currentApiKeyIndex === 0) return "GROQ_API_KEY";
    return `GROQ_API_KEY_ALTERNATIVE_${currentApiKeyIndex}`;
}

// Switch to next API key
function switchToNextKey(): boolean {
    const keys = getApiKeys();
    currentApiKeyIndex++;

    if (currentApiKeyIndex >= keys.length) {
        currentApiKeyIndex = 0;
        allKeysExhausted = true;
        return false; // All keys exhausted
    }

    console.log(`Switching to next API key: ${getCurrentKeyName()}`);
    return true; // Successfully switched
}

// Log API request details
function logRequest(response: Response): void {
    console.log("========================== GROQ API ==========================");
    console.log("API KEY NAME:", getCurrentKeyName());
    console.log("API MODEL:", GROQ_MODEL);
    console.log("ALL KEYS EXHAUSTED:", allKeysExhausted);
    console.log("RESPONSE STATUS:", response.status);
    console.log("===============================================================");
}

// Send request to Groq API with automatic key rotation on rate limit
async function sendToGroq(options: GroqRequestOptions): Promise<GroqResponse> {
    const { messages, temperature = 0.5, max_tokens = 4000 } = options;

    // Reset exhausted flag at the start of a new top-level request
    allKeysExhausted = false;

    const attemptRequest = async (): Promise<GroqResponse> => {
        const apiKey = getCurrentApiKey();

        if (!apiKey) {
            return {
                success: false,
                error: "No GROQ API keys configured",
            };
        }

        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages,
                    temperature,
                    max_tokens,
                }),
            });

            logRequest(response);

            // Handle rate limiting (429 Too Many Requests)
            if (response.status === 429 && !allKeysExhausted) {
                console.log("Rate limited, attempting to switch API key...");
                const switched = switchToNextKey();

                if (switched) {
                    // Retry with new key
                    return attemptRequest();
                } else {
                    // All keys exhausted
                    return {
                        success: false,
                        error: "All API keys exhausted due to rate limiting. Please try again later.",
                    };
                }
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Groq API Error:", errorText);
                return {
                    success: false,
                    error: `Groq API error: ${response.status}`,
                };
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                return {
                    success: false,
                    error: "No content in Groq response",
                };
            }

            return {
                success: true,
                content,
            };
        } catch (error) {
            console.error("Error calling Groq API:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    };

    return attemptRequest();
}

export { sendToGroq, GROQ_MODEL };
export type { GroqMessage, GroqRequestOptions, GroqResponse };
