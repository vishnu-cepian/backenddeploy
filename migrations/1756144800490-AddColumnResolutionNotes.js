/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AddColumnResolutionNotes1756144800490 {
    name = 'AddColumnResolutionNotes1756144800490'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" ADD "resolutionNotes" character varying`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP COLUMN "resolutionNotes"`);
    }
}
