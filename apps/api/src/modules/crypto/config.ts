import { z } from "zod";

const revolutConfigSchema = z.object({
    apiKey: z.string().min(1, "REVOLUT_API_KEY is required"),
    privateKey: z.string().min(1, "REVOLUT_PRIVATE_KEY is required"),
    apiUrl: z.string().default("https://exchange.revolut.com"),
});

const getRevolutConfig = () => {
    // If running in development, you might want to load from .env here if not already loaded globally
    // But index.ts loads env early on.

    // Clean up the private key string if it's single line with visible \n via env
    let privateKey = process.env.REVOLUT_PRIVATE_KEY || "";
    if (privateKey && !privateKey.includes('\n') && privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }

    const config = {
        apiKey: process.env.REVOLUT_API_KEY,
        privateKey: privateKey,
        apiUrl: process.env.REVOLUT_API_URL,
    };

    return revolutConfigSchema.parse(config);
};

export const revolutConfig = getRevolutConfig();
export type RevolutConfig = z.infer<typeof revolutConfigSchema>;
