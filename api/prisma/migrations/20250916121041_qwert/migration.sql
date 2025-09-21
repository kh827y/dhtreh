/*
  Warnings:

  - You are about to drop the `AdminRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdminUser` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AdminUserRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ImpersonationToken` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."AdminUserRole" DROP CONSTRAINT "AdminUserRole_roleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AdminUserRole" DROP CONSTRAINT "AdminUserRole_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ImpersonationToken" DROP CONSTRAINT "ImpersonationToken_adminId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ImpersonationToken" DROP CONSTRAINT "ImpersonationToken_merchantId_fkey";

-- DropTable
DROP TABLE "public"."AdminRole";

-- DropTable
DROP TABLE "public"."AdminUser";

-- DropTable
DROP TABLE "public"."AdminUserRole";

-- DropTable
DROP TABLE "public"."AuditLog";

-- DropTable
DROP TABLE "public"."ImpersonationToken";
