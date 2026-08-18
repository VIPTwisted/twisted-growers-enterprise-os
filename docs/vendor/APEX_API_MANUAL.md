# Apex Trading API — the manual, parsed

**Source of truth:** [apex-openapi-1.0.0.json](apex-openapi-1.0.0.json) — the official OpenAPI spec,
provided by the owner 18 Aug 2026. Parse THIS before guessing any Apex behaviour,
the same rule as the Metrc manual (conversion_factors.metrc_manual_before_guessing).

Base URL: https://app.apextrading.com/api

## Every endpoint

- `GET /v1/available-inventory` — List Available Inventory
- `GET /v1/batches/meta/field-rules` — Batch Field Rules
- `POST /v1/batches/{batchId}/documents` — Add Batch Document — **REQUIRES: batchId**
- `DELETE /v1/batches/{batchId}/documents/{documentId}` — Delete Batch Document — **REQUIRES: batchId, documentId**
- `GET /v2/batches` — List Batches — **REQUIRES: updated_at_from**
- `POST /v2/batches` — Create Batch
- `GET /v2/batches/{id}` — Get Batch — **REQUIRES: id**
- `PUT /v2/batches/{id}` — Update Batch — **REQUIRES: id**
- `GET /v1/brands` — List Brands
- `GET /v1/brands/{id}` — Get Brand — **REQUIRES: id**
- `GET /v1/buyer-contact-logs` — List Buyer Contact Logs — **REQUIRES: updated_at_from**
- `GET /v1/buyer-contact-logs/{id}` — Get Buyer Contact Log — **REQUIRES: id**
- `GET /v1/buyer-groups` — List Buyer Groups — **REQUIRES: updated_at_from**
- `GET /v1/buyer-groups/{id}` — Get Buyer Group — **REQUIRES: id**
- `GET /v1/buyer-leads` — List Buyer Leads
- `GET /v1/buyer-leads/{id}` — Get Buyer Lead — **REQUIRES: id**
- `GET /v1/buyer-stages` — List Buyer Stages
- `GET /v1/buyer-stages/{id}` — Get Buyer Stage — **REQUIRES: id**
- `GET /v1/buyers` — List Buyers — **REQUIRES: updated_at_from**
- `GET /v1/buyers/{id}` — Get Buyer — **REQUIRES: id**
- `GET /v1/cannabinoids` — List Cannabinoids
- `GET /v1/cannabinoids/{id}` — Get Cannabinoid — **REQUIRES: id**
- `GET /v1/company` — List Company
- `GET /v1/container-types` — List Container Types
- `POST /v1/container-types` — Create Container Type
- `GET /v1/container-types/{id}` — Get Container Type — **REQUIRES: id**
- `PUT /v1/container-types/{id}` — Update Container Type — **REQUIRES: id**
- `DELETE /v1/container-types/{id}` — Delete Container Type — **REQUIRES: id**
- `GET /v1/crude-extract-types` — List Crude Extract Types
- `GET /v1/crude-extract-types/{id}` — Get Crude Extract Type — **REQUIRES: id**
- `GET /v1/cultivar-types` — List Cultivar Types
- `GET /v1/cultivar-types/{id}` — Get Cultivar Type — **REQUIRES: id**
- `GET /v1/cultivars` — List Cultivars
- `POST /v1/cultivars` — Create Cultivar
- `GET /v1/cultivars/{id}` — Get Cultivar — **REQUIRES: id**
- `PUT /v1/cultivars/{id}` — Update Cultivar — **REQUIRES: id**
- `DELETE /v1/cultivars/{id}` — Delete Cultivar — **REQUIRES: id**
- `GET /v1/deal-docs` — List Deal Docs
- `GET /v1/deal-docs/{id}` — Get Deal Doc — **REQUIRES: id**
- `GET /v1/deal-flows` — List Deal Flows
- `GET /v1/deal-flows/{id}` — Get Deal Flow — **REQUIRES: id**
- `GET /v1/distillate-extract-types` — List Distillate Extract Types
- `GET /v1/distillate-extract-types/{id}` — Get Distillate Extract Type — **REQUIRES: id**
- `GET /v1/drying-methods` — List Drying Methods
- `GET /v1/drying-methods/{id}` — Get Drying Method — **REQUIRES: id**
- `GET /v1/environmental-issues` — List Environmental Issues
- `POST /v1/environmental-issues` — Create Environmental Issue
- `GET /v1/environmental-issues/{id}` — Get Environmental Issue — **REQUIRES: id**
- `PUT /v1/environmental-issues/{id}` — Update Environmental Issue — **REQUIRES: id**
- `DELETE /v1/environmental-issues/{id}` — Delete Environmental Issue — **REQUIRES: id**
- `GET /v1/extraction-methods` — List Extraction Methods
- `GET /v1/extraction-methods/{id}` — Get Extraction Method — **REQUIRES: id**
- `GET /v1/feminized-types` — List Feminized Types
- `GET /v1/feminized-types/{id}` — Get Feminized Type — **REQUIRES: id**
- `GET /v1/flavors` — List Flavors
- `POST /v1/flavors` — Create Flavor
- `GET /v1/flavors/{id}` — Get Flavor — **REQUIRES: id**
- `PUT /v1/flavors/{id}` — Update Flavor — **REQUIRES: id**
- `DELETE /v1/flavors/{id}` — Delete Flavor — **REQUIRES: id**
- `GET /v1/flowering-periods` — List Flowering Periods
- `POST /v1/flowering-periods` — Create Flowering Period
- `GET /v1/flowering-periods/{id}` — Get Flowering Period — **REQUIRES: id**
- `PUT /v1/flowering-periods/{id}` — Update Flowering Period — **REQUIRES: id**
- `DELETE /v1/flowering-periods/{id}` — Delete Flowering Period — **REQUIRES: id**
- `GET /v1/government-agencies` — List Government Agencies
- `GET /v1/government-agencies/{id}` — Get Government Agency — **REQUIRES: id**
- `GET /v1/grow-environments` — List Grow Environments
- `GET /v1/grow-environments/{id}` — Get Grow Environment — **REQUIRES: id**
- `GET /v1/grow-mediums` — List Grow Mediums
- `GET /v1/grow-mediums/{id}` — Get Grow Medium — **REQUIRES: id**
- `GET /v1/infusion-methods` — List Infusion Methods
- `GET /v1/infusion-methods/{id}` — Get Infusion Method — **REQUIRES: id**
- `GET /v1/marketplace` — Browse Marketplace
- `GET /v1/marketplace/cart` — List Carts
- `GET /v1/marketplace/cart/{cartId}` — View Cart — **REQUIRES: cartId**
- `DELETE /v1/marketplace/cart/{cartId}` — Delete Cart — **REQUIRES: cartId**
- `POST /v1/marketplace/cart/items` — Add Items to Cart
- `DELETE /v1/marketplace/cart/{cartId}/items` — Remove Items from Cart — **REQUIRES: cartId**
- `POST /v1/marketplace/cart/{cartId}/convert` — Convert Cart to Orders — **REQUIRES: cartId**
- `GET /v1/net-terms` — List Net Terms
- `GET /v1/net-terms/{id}` — Get Net Term — **REQUIRES: id**
- `GET /v1/operations` — List Operations
- `GET /v1/operations/{id}` — Get Operation — **REQUIRES: id**
- `GET /v1/receiving-orders` — List Receiving Orders — **REQUIRES: updated_at_from**
- `GET /v1/receiving-orders/{id}` — Get a company's receiving (buying) order — **REQUIRES: id**
- `GET /v1/shipping-orders` — List Shipping Orders — **REQUIRES: updated_at_from**
- `GET /v1/shipping-orders/{id}` — Get Shipping Order — **REQUIRES: id**
- `PUT /v1/shipping-orders/{id}` — Update Shipping Order — **REQUIRES: id**
- `GET /v1/shipping-orders/cart` — List Carts
- `GET /v1/shipping-orders/cart/{cartId}` — View Cart — **REQUIRES: cartId**
- `DELETE /v1/shipping-orders/cart/{cartId}` — Delete Cart — **REQUIRES: cartId**
- `POST /v1/shipping-orders/cart/items` — Add Items to Cart
- `DELETE /v1/shipping-orders/cart/{cartId}/items` — Remove Items from Cart — **REQUIRES: cartId**
- `POST /v1/shipping-orders/cart/{cartId}/convert` — Convert Cart to Orders — **REQUIRES: cartId**
- `GET /v1/shipping-orders/{orderID}/payments/{paymentID}` — Get Payment — **REQUIRES: orderID, paymentID**
- `PUT /v1/shipping-orders/{orderID}/payments/{paymentID}` — Update Payment — **REQUIRES: orderID, paymentID**
- `DELETE /v1/shipping-orders/{orderID}/payments/{paymentID}` — Delete Payment — **REQUIRES: orderID, paymentID**
- `POST /v1/shipping-orders/{orderID}/payments` — Create Payment — **REQUIRES: orderID**
- `GET /v1/package-sizes` — List Package Sizes
- `GET /v1/package-sizes/{id}` — Get Package Size — **REQUIRES: id**
- `GET /v1/product-additives` — List Product Additives
- `GET /v1/product-additives/{id}` — Get Product Additive — **REQUIRES: id**
- `GET /v1/product-categories` — List Product Categories
- `GET /v1/product-categories/{id}` — Get Product Category — **REQUIRES: id**
- `GET /v1/product-types` — List Product Types
- `GET /v1/product-types/{id}` — Get Product Type — **REQUIRES: id**
- `GET /v1/products` — List Products — **REQUIRES: updated_at_from**
- `POST /v1/products` — Create Product
- `GET /v1/products/{id}` — Get Product — **REQUIRES: id**
- `PUT /v1/products/{id}` — Update Product — **REQUIRES: id**
- `GET /v1/products/meta/field-rules` — Product Field Rules
- `POST /v1/products/{productId}/images` — Add Product Image — **REQUIRES: productId**
- `DELETE /v1/products/{productId}/images/{imageId}` — Delete Product Image — **REQUIRES: productId, imageId**
- `POST /v1/products/{productId}/ingredients-upload` — Upload Product Ingredients — **REQUIRES: productId**
- `GET /v1/state-of-materials` — List State Of Materials
- `GET /v1/state-of-materials/{id}` — Get State Of Material — **REQUIRES: id**
- `GET /v1/storage-types` — List Storage Types
- `POST /v1/storage-types` — Create Storage Type
- `GET /v1/storage-types/{id}` — Get Storage Type — **REQUIRES: id**
- `PUT /v1/storage-types/{id}` — Update Storage Type — **REQUIRES: id**
- `DELETE /v1/storage-types/{id}` — Delete Storage Type — **REQUIRES: id**
- `GET /v1/tags` — List Tags
- `GET /v1/terpenes` — List Terpenes
- `GET /v1/terpenes/{id}` — Get Terpene — **REQUIRES: id**
- `GET /v1/transporter-orders` — List Transporter Orders
- `GET /v1/transporter-orders/{id}` — Get Transporter Order — **REQUIRES: id**
- `GET /v1/trim-methods` — List Trim Methods
- `GET /v1/trim-methods/{id}` — Get Trim Method — **REQUIRES: id**
- `GET /v1/unit-measurements` — List Unit Measurements
- `GET /v1/unit-measurements/{id}` — Get Unit Measurement — **REQUIRES: id**
- `GET /v1/usage` — Returns usage metrics for the current month, including credits consumed and
the token's monthly credit limit (null = unlimited)
- `GET /v1/welcome` — List Welcome

## The two facts that settle open work

1. **deal-docs requires NOTHING** — `GET /v1/deal-docs` takes only per_page/no_track.
   Its 0-rows-forever state has no API-side excuse; the sync simply never ran it.
2. **shipping-orders REQUIRES updated_at_from** — the 422 errors of 9 Aug 2026
   ("The updated at from field is required") were this. Every list endpoint that
   422s needs its required params checked HERE first.
