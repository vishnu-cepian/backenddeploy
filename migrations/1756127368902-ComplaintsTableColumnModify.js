/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class ComplaintsTableColumnModify1756127368902 {
    name = 'ComplaintsTableColumnModify1756127368902'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_4b5fb19c320cd50b6e4faf998a9"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP COLUMN "userId"`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD "customerId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD "vendorId" uuid`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_3860fae46824a024252a3875769" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_7da39c122c10f123d518a7c9d2e" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_7da39c122c10f123d518a7c9d2e"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_3860fae46824a024252a3875769"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP COLUMN "vendorId"`);
        await queryRunner.query(`ALTER TABLE "complaints" DROP COLUMN "customerId"`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD "userId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_4b5fb19c320cd50b6e4faf998a9" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }
}
