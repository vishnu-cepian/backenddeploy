/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class PayoutsTableAlter1756309498528 {
    name = 'PayoutsTableAlter1756309498528'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" ADD "entry_created_at" TIMESTAMP NOT NULL DEFAULT now()`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "entry_created_at"`);
    }
}
