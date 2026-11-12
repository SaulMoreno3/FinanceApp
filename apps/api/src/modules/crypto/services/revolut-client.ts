import crypto from 'crypto';
import { revolutConfig } from '../config';

interface RequestOptions {
    method: 'GET' | 'POST' | 'DELETE' | 'PUT';
    path: string;
    queryParams?: Record<string, string>;
    body?: unknown;
}

export class RevolutClient {
    private apiKey: string;
    private privateKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = revolutConfig.apiKey;
        this.privateKey = revolutConfig.privateKey;
        this.baseUrl = revolutConfig.apiUrl;
    }

    /**
     * Generates the signature required for authentication.
     * Format: timestamp + method + path + querystring + body
     */
    private signRequest(timestamp: number, method: string, path: string, queryString: string, bodyString: string): string {
        const payload = `${timestamp}${method}${path}${queryString}${bodyString}`;

        const signature = crypto.sign(null, Buffer.from(payload), this.privateKey);
        return signature.toString('base64');
    }

    private async request<T>(options: RequestOptions): Promise<T> {
        const { method, path, queryParams, body } = options;

        // Construct Query String
        const urlSearchParams = new URLSearchParams(queryParams);
        const queryString = urlSearchParams.toString();
        const fullUrl = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`;

        // Construct Body String
        const bodyString = body ? JSON.stringify(body) : '';

        // Generate Timestamp
        const timestamp = Date.now();

        // Generate Signature
        // Note: The documentation states: "Request Path: The path starting from /api (e.g., /api/1.0/orders/active)."
        // We assume the input `path` variable starts with /api
        const signature = this.signRequest(timestamp, method, path, queryString, bodyString);

        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'X-Revx-API-Key': this.apiKey,
            'X-Revx-Timestamp': timestamp.toString(),
            'X-Revx-Signature': signature,
        };

        console.log(`[RevolutClient] ${method} ${fullUrl}`);

        const response = await fetch(fullUrl, {
            method,
            headers,
            body: body ? bodyString : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Revolut API Error: ${response.status} - ${errorText}`);
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return {} as T;
        }

        return response.json() as Promise<T>;
    }

    public async get<T>(path: string, queryParams?: Record<string, string>): Promise<T> {
        return this.request<T>({ method: 'GET', path, queryParams });
    }

    public async post<T>(path: string, body: unknown): Promise<T> {
        return this.request<T>({ method: 'POST', path, body });
    }
}

export const revolutClient = new RevolutClient();
