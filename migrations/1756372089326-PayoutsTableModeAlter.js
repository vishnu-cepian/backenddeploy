/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class PayoutsTableModeAlter1756372089326 {
    name = 'PayoutsTableModeAlter1756372089326'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" ADD "mode" character varying`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "mode"`);
    }
}
