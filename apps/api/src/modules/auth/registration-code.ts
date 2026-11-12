import { createHash, timingSafeEqual } from 'node:crypto';

export function verifyRegistrationCode(code: string) {
    const expected = process.env.REGISTRATION_CODE;
    // Configuration failures must never silently reopen registration.
    if (!expected) throw Object.assign(new Error('El registro está cerrado temporalmente'), { statusCode: 503 });
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(code), digest(expected))) {
        throw Object.assign(new Error('Código de acceso incorrecto'), { statusCode: 403 });
    }
}
