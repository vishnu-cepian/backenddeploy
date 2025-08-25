/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AddColumnResolvedAt1756144429235 {
    name = 'AddColumnResolvedAt1756144429235'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" ADD "resolvedAt" TIMESTAMP`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP COLUMN "resolvedAt"`);
    }
}
