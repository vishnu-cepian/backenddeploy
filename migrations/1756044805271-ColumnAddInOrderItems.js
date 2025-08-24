/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class ColumnAddInOrderItems1756044805271 {
    name = 'ColumnAddInOrderItems1756044805271'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "orderItems" ADD "clothProvided" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "orderItems" ADD "tailorService" character varying`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "orderItems" DROP COLUMN "tailorService"`);
        await queryRunner.query(`ALTER TABLE "orderItems" DROP COLUMN "clothProvided"`);
    }
}
