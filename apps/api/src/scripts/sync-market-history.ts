import { prisma } from '../common/db/prisma';
import { marketDataService } from '../modules/market-data/market-data.service';

function getArgument(name: string): string | undefined {
    const prefix = `--${name}=`;
    return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const email = getArgument('email');
if (!email) {
    throw new Error('Usage: pnpm sync:market-history -- --email=user@example.com');
}

try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`No user found for ${email}`);
    const result = await marketDataService.syncUserHistory(user.id);
    console.log(JSON.stringify(result, null, 2));
} finally {
    await prisma.$disconnect();
}
