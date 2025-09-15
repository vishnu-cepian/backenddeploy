/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class NewMigrationForSeeding1757921891125 {
    name = 'NewMigrationForSeeding1757921891125'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "settings" ALTER COLUMN "value" DROP NOT NULL`);
        // await queryRunner.query(`ALTER TABLE "settings" ALTER COLUMN "value" DROP NOT NULL`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "settings" ALTER COLUMN "value" SET NOT NULL`);
        // await queryRunner.query(`ALTER TABLE "settings" ALTER COLUMN "value" SET NOT NULL`);
    }
}
