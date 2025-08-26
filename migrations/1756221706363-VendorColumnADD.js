/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class VendorColumnADD1756221706363 {
    name = 'VendorColumnADD1756221706363'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "vendors" ADD "razorpay_contact_id" character varying`);
        await queryRunner.query(`ALTER TABLE "vendors" ADD "razorpay_fund_account_id" character varying`);
        await queryRunner.query(`CREATE INDEX "vendor_razorpay_fund_account_id_idx" ON "vendors" ("razorpay_fund_account_id") `);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."vendor_razorpay_fund_account_id_idx"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "razorpay_fund_account_id"`);
        await queryRunner.query(`ALTER TABLE "vendors" DROP COLUMN "razorpay_contact_id"`);
    }
}
