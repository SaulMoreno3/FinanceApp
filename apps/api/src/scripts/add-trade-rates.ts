import pool from '../common/db/client';

async function main() {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add conversionRate and eurCost to stock_trades...');

        await client.query('BEGIN');

        // Check columns
        const checkRes = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='stock_trades' AND column_name='conversionRate';
        `);

        if (checkRes.rows.length === 0) {
            console.log('Adding conversionRate and eurCost columns...');
            await client.query(`
                ALTER TABLE stock_trades
                ADD COLUMN "conversionRate" DOUBLE PRECISION,
                ADD COLUMN "eurCost" DOUBLE PRECISION;
            `);
            console.log('Columns added successfully.');
        } else {
            console.log('Columns already exist. Skipping.');
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
