/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class RefundcolumnsADD1756191733233 {
    name = 'RefundcolumnsADD1756191733233'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "refunds" ADD "speedRequested" character varying`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD "speedProcessed" character varying`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "speedProcessed"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP COLUMN "speedRequested"`);
    }
}
