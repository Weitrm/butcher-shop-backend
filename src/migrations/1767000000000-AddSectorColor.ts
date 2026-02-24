import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSectorColor1767000000000 implements MigrationInterface {
  name = 'AddSectorColor1767000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sectors"
      ADD COLUMN IF NOT EXISTS "color" text NOT NULL DEFAULT '#E2E8F0';
    `);

    await queryRunner.query(`
      UPDATE "sectors"
      SET "color" = '#E2E8F0'
      WHERE "color" IS NULL OR BTRIM("color") = '';
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "sectorColorSnapshot" text;
    `);

    await queryRunner.query(`
      UPDATE "orders" o
      SET "sectorColorSnapshot" = s."color"
      FROM "sectors" s
      WHERE o."sectorIdSnapshot" = s."id"
        AND o."sectorColorSnapshot" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "sectorColorSnapshot";
    `);

    await queryRunner.query(`
      ALTER TABLE "sectors"
      DROP COLUMN IF EXISTS "color";
    `);
  }
}
