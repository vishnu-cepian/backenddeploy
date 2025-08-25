/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class DropUpdatelog1756124519709 {

    async up(queryRunner) {
        await queryRunner.dropTable("updateLogs");
    }

    async down(queryRunner) {
        await queryRunner.dropTable("updateLogs");
    }

}
