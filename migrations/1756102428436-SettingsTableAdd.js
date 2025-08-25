/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class SettingsTableAdd1756102428436 {
    name = 'SettingsTableAdd1756102428436'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying NOT NULL, "value" character varying NOT NULL, "type" character varying NOT NULL, "updatedBy" uuid, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0669fe20e252eb692bf4d344975" PRIMARY KEY ("id"))`);
    }

    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE "settings"`);
    }
}
