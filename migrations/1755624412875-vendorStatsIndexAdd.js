/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class VendorStatsIndexAdd1755624412875 {
    name = 'VendorStatsIndexAdd1755624412875'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalEarnings" TYPE numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalDeductions" TYPE numeric(12,2)`);
        // await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalEarnings" TYPE numeric(12,2)`);
        // await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalDeductions" TYPE numeric(12,2)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "vendor_stats_vendor_id_idx" ON "vendor_stats" ("vendorId") `);
        // await queryRunner.query(`CREATE UNIQUE INDEX "vendor_stats_vendor_id_idx" ON "vendor_stats" ("vendorId") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."vendor_stats_vendor_id_idx"`);
        // await queryRunner.query(`DROP INDEX "public"."vendor_stats_vendor_id_idx"`);
        await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalDeductions" TYPE numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalEarnings" TYPE numeric(10,2)`);
        // await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalDeductions" TYPE numeric(10,2)`);
        // await queryRunner.query(`ALTER TABLE "vendor_stats" ALTER COLUMN "totalEarnings" TYPE numeric(10,2)`);
    }
}
