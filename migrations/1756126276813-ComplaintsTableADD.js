/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class ComplaintsTableADD1756126276813 {
    name = 'ComplaintsTableADD1756126276813'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "complaints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "email" character varying NOT NULL, "phoneNumber" character varying NOT NULL, "name" character varying NOT NULL, "orderId" uuid, "complaint" character varying NOT NULL, "isResolved" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4b7566a2a489c2cc7c12ed076ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_4b5fb19c320cd50b6e4faf998a9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_cac0c60efb829c91a09565fcc51" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_cac0c60efb829c91a09565fcc51"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_4b5fb19c320cd50b6e4faf998a9"`);
        await queryRunner.query(`DROP TABLE "complaints"`);
    }
}
