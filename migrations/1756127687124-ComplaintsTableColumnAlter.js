/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class ComplaintsTableColumnAlter1756127687124 {
    name = 'ComplaintsTableColumnAlter1756127687124'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_3860fae46824a024252a3875769"`);
        await queryRunner.query(`ALTER TABLE "complaints" ALTER COLUMN "customerId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_3860fae46824a024252a3875769" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "complaints" DROP CONSTRAINT "FK_3860fae46824a024252a3875769"`);
        await queryRunner.query(`ALTER TABLE "complaints" ALTER COLUMN "customerId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "complaints" ADD CONSTRAINT "FK_3860fae46824a024252a3875769" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }
}
