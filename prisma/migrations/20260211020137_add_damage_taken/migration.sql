/*
  Warnings:

  - Added the required column `damageTaken` to the `match_participants` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "match_participants" ADD COLUMN     "damageTaken" INTEGER NOT NULL;
