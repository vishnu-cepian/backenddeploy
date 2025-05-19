import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVectorIndexes1747670509797 implements MigrationInterface {
    name = 'AddVectorIndexes1747670509797'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "vendor_location_gix" ON "vendor" USING GiST ("location") `);
        await queryRunner.query(`CREATE INDEX "vendor_rating_idx" ON "vendor" ("rating") `);
        await queryRunner.query(`CREATE INDEX "vendor_name_idx" ON "vendor" ("fullName") `);
        await queryRunner.query(`CREATE INDEX "vendor_shopname_idx" ON "vendor" ("shopName") `);
        await queryRunner.query(`CREATE INDEX "vendor_servicetype_idx" ON "vendor" ("serviceType") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."vendor_servicetype_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_shopname_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_name_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_rating_idx"`);
        await queryRunner.query(`DROP INDEX "public"."vendor_location_gix"`);
    }

}
