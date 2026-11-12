import pool from '../common/db/client';

async function main() {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add assetType to stock_trades...');

        await client.query('BEGIN');

        // Check if column exists
        const checkRes = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='stock_trades' AND column_name='assetType';
        `);

        if (checkRes.rows.length === 0) {
            console.log('Adding assetType column...');
            await client.query(`
                ALTER TABLE stock_trades
                ADD COLUMN "assetType" TEXT NOT NULL DEFAULT 'Stock';
            `);
            console.log('Column added successfully.');
        } else {
            console.log('Column already exists. Skipping.');
        }

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error running migration:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
