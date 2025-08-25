/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class AdminActionTableAdd1756124814094 {
    name = 'AdminActionTableAdd1756124814094'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "adminActions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "adminUserId" uuid NOT NULL, "action" character varying NOT NULL, "actionData" json NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3d08c0580c779db76a6bddcbcc3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "adminActions" ADD CONSTRAINT "FK_1f0d0b7c50c9c59f87fcdc7be96" FOREIGN KEY ("adminUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "adminActions" DROP CONSTRAINT "FK_1f0d0b7c50c9c59f87fcdc7be96"`);
        await queryRunner.query(`DROP TABLE "adminActions"`);
    }
}
