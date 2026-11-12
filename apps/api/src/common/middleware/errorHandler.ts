import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
    const validation = err instanceof ZodError;
    const candidate = err.statusCode ?? err.status;
    const statusCode = validation || err instanceof multer.MulterError || err.message?.includes('documents are allowed')
        ? 400 : Number.isInteger(candidate) && candidate >= 400 && candidate < 600 ? candidate : 500;
    // Never log request bodies, database details, tokens or parser error objects.
    if (statusCode >= 500) console.error('[Error]', err.name ?? 'Error', 'status', statusCode);
    const message = validation ? err.issues.map((issue: any) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
        : statusCode >= 500 ? 'Internal Server Error' : statusCode === 413 ? 'Request too large' : err.message || 'Invalid request';
    res.status(statusCode).json({ error: message });
};
