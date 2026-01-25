-- Drop legacy catalog indexes (safe even if already removed)
DROP INDEX IF EXISTS "ProductCategory_merchantId_slug_key";
DROP INDEX IF EXISTS "ProductCategory_merchantId_order_idx";
DROP INDEX IF EXISTS "Product_merchantId_sku_key";
DROP INDEX IF EXISTS "Product_merchantId_externalProvider_externalId_idx";
DROP INDEX IF EXISTS "Product_merchantId_order_idx";
DROP INDEX IF EXISTS "idx_product_merchant_barcode_deleted";
DROP INDEX IF EXISTS "idx_product_merchant_code_deleted";

-- Drop legacy catalog tables
DROP TABLE IF EXISTS "ProductVariantOption";
DROP TABLE IF EXISTS "ProductOptionValue";
DROP TABLE IF EXISTS "ProductOption";
DROP TABLE IF EXISTS "ProductAttribute";
DROP TABLE IF EXISTS "ProductStock";
DROP TABLE IF EXISTS "ProductVariant";
DROP TABLE IF EXISTS "ProductImage";
DROP TABLE IF EXISTS "ProductExternalId";

-- Simplify ProductCategory
ALTER TABLE "ProductCategory"
  DROP COLUMN IF EXISTS "slug",
  DROP COLUMN IF EXISTS "code",
  DROP COLUMN IF EXISTS "imageUrl",
  DROP COLUMN IF EXISTS "order";

-- Simplify Product
ALTER TABLE "Product"
  DROP COLUMN IF EXISTS "code",
  DROP COLUMN IF EXISTS "sku",
  DROP COLUMN IF EXISTS "barcode",
  DROP COLUMN IF EXISTS "unit",
  DROP COLUMN IF EXISTS "externalProvider",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "order",
  DROP COLUMN IF EXISTS "iikoProductId",
  DROP COLUMN IF EXISTS "hasVariants",
  DROP COLUMN IF EXISTS "priceEnabled",
  DROP COLUMN IF EXISTS "allowCart",
  DROP COLUMN IF EXISTS "visible",
  DROP COLUMN IF EXISTS "weightValue",
  DROP COLUMN IF EXISTS "weightUnit",
  DROP COLUMN IF EXISTS "heightCm",
  DROP COLUMN IF EXISTS "widthCm",
  DROP COLUMN IF EXISTS "depthCm",
  DROP COLUMN IF EXISTS "proteins",
  DROP COLUMN IF EXISTS "fats",
  DROP COLUMN IF EXISTS "carbs",
  DROP COLUMN IF EXISTS "calories",
  DROP COLUMN IF EXISTS "tags",
  DROP COLUMN IF EXISTS "purchasesMonth",
  DROP COLUMN IF EXISTS "purchasesTotal";
