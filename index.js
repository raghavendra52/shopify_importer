import fs from "fs";
import path from "path";
import xlsx from "xlsx";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2025-01";
const GRAPHQL_ENDPOINT = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

// --- HELPER FUNCTIONS ---

async function shopifyRequest(query, variables = {}) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(JSON.stringify(result.errors));
  }

  // Check for general user errors
  const keys = Object.keys(result.data || {});
  if (keys.length > 0) {
    const mutationData = result.data[keys[0]];
    // specific check for mediaUserErrors or userErrors
    if (
      mutationData &&
      mutationData.userErrors &&
      mutationData.userErrors.length > 0
    ) {
      throw new Error(JSON.stringify(mutationData.userErrors));
    }
    if (
      mutationData &&
      mutationData.mediaUserErrors &&
      mutationData.mediaUserErrors.length > 0
    ) {
      throw new Error(JSON.stringify(mutationData.mediaUserErrors));
    }
  }
  return result.data;
}

async function findProductBySku(sku) {
  const query = `
    query($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            variants(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
    }`;

  const variables = { query: `sku:${sku}` };
  const data = await shopifyRequest(query, variables);
  const edges = data.products.edges;

  if (edges.length > 0) {
    const product = edges[0].node;
    const variantId =
      product.variants.edges.length > 0
        ? product.variants.edges[0].node.id
        : null;
    return { productId: product.id, variantId };
  }
  return null;
}

async function createProduct(row) {
  const mutation = `
    mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          title
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`;

  const input = {
    title: row.title,
    descriptionHtml: row.description,
    productType: row.productType,
    vendor: row.vendor,
    tags: row.tags ? row.tags.split(",").map((t) => t.trim()) : [],
  };

  const media = row.imageUrl
    ? [
        {
          originalSource: row.imageUrl,
          mediaContentType: "IMAGE",
        },
      ]
    : undefined;

  const data = await shopifyRequest(mutation, { input, media });
  const product = data.productCreate.product;

  // Update the first variant with price and SKU
  if (product.variants.edges.length > 0) {
    const variantId = product.variants.edges[0].node.id;
    await updateVariant(product.id, variantId, row.price, row.sku);
  }

  console.log(`✅ Created: ${row.title} (SKU: ${row.sku})`);
  return product;
}

async function updateVariant(productId, variantId, price, sku) {
  const mutation = `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`;

  const variants = [
    {
      id: variantId,
      price: price.toString(),
      inventoryItem: { sku: sku },
    },
  ];

  await shopifyRequest(mutation, { productId, variants });
}

// NEW FUNCTION: Specifically handles adding images to existing products
async function addImageToProduct(productId, imageUrl) {
  const mutation = `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          status
        }
        mediaUserErrors {
          field
          message
        }
      }
    }`;

  const media = [
    {
      originalSource: imageUrl,
      mediaContentType: "IMAGE",
    },
  ];

  await shopifyRequest(mutation, { productId, media });
  console.log(`   ↳ Image added.`);
}

async function updateProduct(productId, variantId, row) {
  // 1. Update Main Product Fields
  const productMutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`;

  const productInput = {
    id: productId,
    title: row.title,
    descriptionHtml: row.description,
    productType: row.productType,
    vendor: row.vendor,
    tags: row.tags ? row.tags.split(",").map((t) => t.trim()) : [],
  };

  await shopifyRequest(productMutation, { input: productInput });

  // 2. Update Variant Fields
  if (variantId) {
    await updateVariant(productId, variantId, row.price, row.sku);
  }

  // 3. Add Image (Only if imageUrl is present in Excel)
  if (row.imageUrl) {
    try {
      await addImageToProduct(productId, row.imageUrl);
    } catch (e) {
      console.warn(`   ⚠️ Failed to add image: ${e.message}`);
    }
  }

  console.log(`🔄 Updated: ${row.title} (SKU: ${row.sku})`);
}

// --- MAIN EXECUTION ---

async function main() {
  const filePath = path.join(process.cwd(), "products.xlsx");

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    return;
  }

  console.log(`Reading file: ${filePath}...`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${data.length} products. Starting import...`);

  for (const row of data) {
    if (!row.sku || !row.title) {
      console.warn(`Skipping row: Missing SKU or Title`, row);
      continue;
    }

    try {
      const existingProduct = await findProductBySku(row.sku);

      if (existingProduct) {
        await updateProduct(
          existingProduct.productId,
          existingProduct.variantId,
          row
        );
      } else {
        await createProduct(row);
      }
    } catch (error) {
      console.error(`❌ Error processing ${row.sku}:`, error.message);
    }
  }

  console.log("Import complete!");
}

main();
