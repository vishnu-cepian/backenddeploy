/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class SeedSettings1756103991251 {

    async up(queryRunner) {
        await queryRunner.query(`INSERT INTO "settings" ("key", "value", "type") VALUES ('platform_fee_percent', '10', 'number')`);
        await queryRunner.query(`INSERT INTO "settings" ("key", "value", "type") VALUES ('vendor_fee_percent', '20', 'number')`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DELETE FROM "settings" WHERE "key" = 'platform_fee_percent'`);
        await queryRunner.query(`DELETE FROM "settings" WHERE "key" = 'vendor_fee_percent'`);
    }

}
