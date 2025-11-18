Shopify Product Import Script – README

This README provides clear setup and usage instructions for the Shopify Product Import Script written in Node.js. The script reads an Excel (.xlsx) file and automatically creates or updates Shopify products using the Shopify Admin GraphQL API.

---------------------------------------------
Overview
---------------------------------------------
This script:
• Authenticates using a private Shopify Admin API token.
• Reads product data from an Excel workbook (products.xlsx).
• For each row:
  – Creates a new product if it does not exist, OR
  – Updates the existing product if the SKU already exists.
• Supports:
  – Title
  – Description
  – Product Type
  – Vendor
  – Tags
  – Price
  – SKU
  – At least one variant
• Also supports adding an image from a URL (if provided in Excel).

---------------------------------------------
Folder Requirements
---------------------------------------------
Place these files in the same folder:
• index.js (the script)
• products.xlsx (your product data)
• .env (environment variables)

---------------------------------------------
Environment Variables (.env file)
---------------------------------------------
Create a .env file in the same folder with the following values:

SHOPIFY_STORE_URL=yourstore.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token

Make sure the access token is from a Private App / Custom App with Admin API access.

---------------------------------------------
Excel File Format (products.xlsx)
---------------------------------------------
Each row in the Excel file should contain the following column headers:

title
description
productType
vendor
tags
sku
price
imageUrl (optional)

Important:
• SKU is used to detect whether a product already exists.
• If SKU exists → product is updated.
• If SKU does NOT exist → new product is created.

---------------------------------------------
Installation
---------------------------------------------
Run the following commands inside the project folder:

npm install xlsx node-fetch dotenv

---------------------------------------------
How to Run the Script
---------------------------------------------
After installation, run:

node index.js

The script will automatically:
• Load products.xlsx
• Process each row
• Create/update Shopify products

---------------------------------------------
What Happens Internally
---------------------------------------------
1. The script searches for the product using Shopify GraphQL (by SKU).
2. If found:
   – Updates product title, description, type, vendor, tags.
   – Updates the first variant (price + SKU).
   – Adds an image (if imageUrl exists).
3. If not found:
   – Creates a new product.
   – Adds its image.
   – Updates the first variant.

---------------------------------------------
Console Output
---------------------------------------------
The script prints messages like:
• “Created: Product Name (SKU: 123)”
• “Updated: Product Name (SKU: 123)”
• “Error processing SKU: message”

---------------------------------------------
Notes
---------------------------------------------
• Ensure your Shopify Admin API has write access to Products.
• Avoid running the script repeatedly unless you want continuous updates.
• Make sure the Excel sheet name is the first sheet in the workbook.

---------------------------------------------
End of README
---------------------------------------------

