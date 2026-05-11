import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnlyBoxesToProducts1772000000000 implements MigrationInterface {
  name = 'AddOnlyBoxesToProducts1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "onlyBoxes" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      UPDATE "products"
      SET "allowBoxes" = true
      WHERE "onlyBoxes" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "onlyBoxes";
    `);
  }
}
