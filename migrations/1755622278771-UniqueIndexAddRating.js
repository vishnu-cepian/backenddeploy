/**
 * @typedef {import('typeorm').MigrationInterface} MigrationInterface
 */

/**
 * @class
 * @implements {MigrationInterface}
 */
module.exports = class UniqueIndexAddRating1755622278771 {
    name = 'UniqueIndexAddRating1755622278771'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "rating" DROP CONSTRAINT "FK_1b56a1a54de7bb0d0904c909870"`);
        await queryRunner.query(`ALTER TABLE "rating" ADD CONSTRAINT "UQ_1b56a1a54de7bb0d0904c909870" UNIQUE ("orderId")`);
        // await queryRunner.query(`ALTER TABLE "rating" ADD CONSTRAINT "UQ_1b56a1a54de7bb0d0904c909870" UNIQUE ("orderId")`);
        await queryRunner.query(`ALTER TABLE "rating" ADD CONSTRAINT "FK_1b56a1a54de7bb0d0904c909870" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "rating" DROP CONSTRAINT "FK_1b56a1a54de7bb0d0904c909870"`);
        await queryRunner.query(`ALTER TABLE "rating" DROP CONSTRAINT "UQ_1b56a1a54de7bb0d0904c909870"`);
        // await queryRunner.query(`ALTER TABLE "rating" DROP CONSTRAINT "UQ_1b56a1a54de7bb0d0904c909870"`);
        await queryRunner.query(`ALTER TABLE "rating" ADD CONSTRAINT "FK_1b56a1a54de7bb0d0904c909870" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
}
