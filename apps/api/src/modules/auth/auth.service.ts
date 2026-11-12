
import argon2 from 'argon2';
import { verifyRegistrationCode } from './registration-code';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../common/db/prisma';

const requiredSecret = (name: 'JWT_SECRET' | 'PEPPER') => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not configured`);
    return value;
};

export const passwordSchema = z.string().min(12, 'Usa al menos 12 caracteres').max(128);

export const registerSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: passwordSchema,
    registrationCode: z.string().min(1, 'Introduce el código de acceso').max(128),
});

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(128),
});

const avatarIcons = ['user-round', 'circle-user', 'badge-euro', 'landmark', 'wallet-cards', 'chart-no-axes-combined'] as const;
const avatarColors = ['slate', 'indigo', 'emerald', 'amber', 'rose', 'sky'] as const;

export const updateProfileSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().toLowerCase().email().max(254),
    avatarIcon: z.enum(avatarIcons),
    avatarColor: z.enum(avatarColors),
    locale: z.enum(['es-ES', 'en-US', 'en-GB']),
    timezone: z.string().trim().min(1).max(64),
    currentPassword: z.string().min(1).max(128).optional(),
    preferredCurrency: z.enum(['EUR', 'USD']),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
}).refine(({ currentPassword, newPassword }) => currentPassword !== newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
});

const publicUserSelect = {
    id: true,
    email: true,
    name: true,
    avatarIcon: true,
    avatarColor: true,
    locale: true,
    timezone: true,
    preferredCurrency: true,
    createdAt: true,
    updatedAt: true,
} as const;

const createHttpError = (message: string, statusCode: number) => Object.assign(new Error(message), { statusCode });

export class AuthService {
    private dummyHash?: Promise<string>;

    private getDummyHash() {
        // A missing account still performs Argon2 verification, reducing timing disclosure.
        return this.dummyHash ??= argon2.hash(randomBytes(32), {
            type: argon2.argon2id, secret: Buffer.from(requiredSecret('PEPPER')),
        });
    }

    async register(data: z.infer<typeof registerSchema>) {
        verifyRegistrationCode(data.registrationCode);
        const { email, password } = data;

        // Check if user exists
        const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (existing) {
            throw new Error('User already exists');
        }

        // Hash with Argon2 and Pepper
        const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
            secret: Buffer.from(requiredSecret('PEPPER'))
        });

        const user = await prisma.user.create({
            data: { email, passwordHash },
            select: { ...publicUserSelect, sessionVersion: true },
        });

        const token = this.generateToken(user.id, user.sessionVersion);
        const { sessionVersion: _sessionVersion, ...publicUser } = user;
        return { user: publicUser, token };
    }

    async login(data: z.infer<typeof loginSchema>) {
        const { email, password } = data;

        const user = await prisma.user.findUnique({ where: { email } });
        const hash = user?.passwordHash ?? await this.getDummyHash();

        // Verify with Argon2 and Pepper
        try {
            const match = await argon2.verify(hash, password, {
                secret: Buffer.from(requiredSecret('PEPPER'))
            });

            if (!match || !user) {
                throw new Error('Invalid credentials');
            }
        } catch (err) {
            // argon2.verify might throw on internal errors, or malformed hash
            throw new Error('Invalid credentials');
        }

        if (!user) throw new Error('Invalid credentials');
        const token = this.generateToken(user.id, user.sessionVersion);

        return {
            user: await this.getMe(user.id),
            token,
        };
    }

    async getMe(userId: string) {
        return prisma.user.findUnique({
            where: { id: userId },
            select: publicUserSelect,
        });
    }

    async updateProfile(userId: string, data: z.infer<typeof updateProfileSchema>) {
        const { currentPassword, ...profile } = data;
        const account = await prisma.user.findUnique({ where: { id: userId } });
        if (!account) throw createHttpError('User not found', 404);
        if (profile.email !== account.email) {
            if (!currentPassword) throw createHttpError('Introduce tu contraseña actual para cambiar el correo', 400);
            const matches = await argon2.verify(account.passwordHash, currentPassword, {
                secret: Buffer.from(requiredSecret('PEPPER')),
            }).catch(() => false);
            if (!matches) throw createHttpError('La contraseña actual no es correcta', 400);
        }
        const emailOwner = await prisma.user.findUnique({ where: { email: profile.email }, select: { id: true } });
        if (emailOwner && emailOwner.id !== userId) throw createHttpError('That email address is already in use', 409);
        try {
            const updated = await prisma.user.updateMany({
                where: { id: userId, sessionVersion: account.sessionVersion, passwordHash: account.passwordHash },
                data: profile,
            });
            if (updated.count !== 1) throw createHttpError('La sesión ha cambiado. Vuelve a iniciar sesión.', 409);
        } catch (error: any) {
            if (error.code === 'P2002') throw createHttpError('That email address is already in use', 409);
            throw error;
        }
        return this.getMe(userId);
    }

    async changePassword(userId: string, data: z.infer<typeof changePasswordSchema>) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw createHttpError('User not found', 404);

        const matches = await argon2.verify(user.passwordHash, data.currentPassword, {
            secret: Buffer.from(requiredSecret('PEPPER')),
        }).catch(() => false);
        if (!matches) throw createHttpError('Current password is incorrect', 400);

        const passwordHash = await argon2.hash(data.newPassword, {
            type: argon2.argon2id,
            secret: Buffer.from(requiredSecret('PEPPER')),
        });
        const updatedUser = await prisma.user.updateMany({
            where: { id: userId, passwordHash: user.passwordHash, sessionVersion: user.sessionVersion },
            data: { passwordHash, sessionVersion: { increment: 1 } },
        });
        if (updatedUser.count !== 1) throw createHttpError('La sesión ha cambiado. Vuelve a iniciar sesión.', 409);

        return { token: this.generateToken(userId, user.sessionVersion + 1) };
    }

    async logout(userId: string) {
        await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    }

    private generateToken(userId: string, sessionVersion: number) {
        // In a real high-security app, we would use HttpOnly cookies instead of returning the token in body.
        // For now, we return it, but the client should ideally store it securely.
        return jwt.sign({ userId, sessionVersion }, requiredSecret('JWT_SECRET'), { expiresIn: '7d' });
    }
}

export const authService = new AuthService();
