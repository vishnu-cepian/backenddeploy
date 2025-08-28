/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class PayoutsTableAlter1756369678192 {
    name = 'PayoutsTableAlter1756369678192'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "payout_created_at"`);
        await queryRunner.query(`ALTER TABLE "payouts" ADD "payout_initiated_by_admin_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "payouts" ADD "payout_status_description" jsonb`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "payout_status_description"`);
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "payout_initiated_by_admin_at"`);
        await queryRunner.query(`ALTER TABLE "payouts" ADD "payout_created_at" TIMESTAMP`);
    }
}
