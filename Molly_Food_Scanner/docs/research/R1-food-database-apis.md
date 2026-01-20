# Contract R1: Food Database APIs Research

**Project**: Molly Food Scanner
**Date**: 2026-01-20
**Contract**: R1 - Food Database APIs for Barcode/Product Lookup
**Researcher**: Claude (Research Agent)

## Executive Summary

This research document evaluates available food database APIs for the Molly Food Scanner project, which requires barcode lookup, ingredients analysis, and additives identification. After comprehensive analysis of five major APIs, **Open Food Facts** emerges as the top recommendation for MVP due to its completely free access, comprehensive global database, and rich additives/ingredients data.

---

## API Analysis

### 1. Open Food Facts ⭐ RECOMMENDED

**Overview**: Open-source, collaborative database with 3M+ products globally

#### Key Details

| Attribute | Value |
|-----------|-------|
| **API Endpoint** | `https://world.openfoodfacts.org/api/v0/product/[barcode].json` |
| **Authentication** | OAuth Bearer tokens (2025 update), basic reads may be public |
| **Free Tier** | ✅ **100% FREE** - No API key required for basic reads |
| **Database Size** | 3M+ products (global) |
| **Barcode Support** | ✅ Full UPC/EAN barcode lookup |
| **Rate Limits** | 1 API call = 1 real user scan (fair use policy) |
| **Commercial Use** | ✅ Allowed with attribution (ODBL license) |
| **JavaScript SDK** | Unofficial wrappers available, REST API straightforward |

#### Data Returned

- ✅ **Complete ingredient list** (parsed and hierarchical)
- ✅ **Additives data** (E-numbers, categories, risk levels)
- ✅ **Nutritional information** (per 100g, per serving)
- ✅ **Allergens** (traces, contains, may contain)
- ✅ **Nutri-Score** (health grading A-E)
- ✅ **Eco-Score** (environmental impact)
- ✅ **Nova Group** (ultra-processed classification)
- ✅ **Product images** (front, ingredients, nutrition)
- ✅ **Labels/certifications** (organic, fair trade, etc.)

#### Pricing

- **FREE**: Unlimited read access (public data)
- **Premium API**: For high-volume commercial use (contact for pricing)
- **Data Scraping**: Not allowed - use API only

#### Pros

- ✅ **Completely free** for MVP and beyond
- ✅ **Largest global database** (3M+ products)
- ✅ **Rich additives data** (E-numbers, risk analysis)
- ✅ **Open-source** - community-maintained
- ✅ **No API key required** for basic usage
- ✅ **RESTful JSON API** - easy integration
- ✅ **Mobile apps use it** (Yuka, etc.) - proven at scale
- ✅ **Multiple language support**
- ✅ **Export capabilities** (CSV, JSON)

#### Cons

- ⚠️ Data quality varies (community-edited)
- ⚠️ Rate limiting enforcement vague ("fair use")
- ⚠️ No official SDK (but simple REST API)
- ⚠️ API documentation can be fragmented

#### Documentation Links

- [API Introduction](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Barcode/Product Lookup](https://wiki.openfoodfacts.org/API/Read/Product)
- [Search API V3](https://wiki.openfoodfacts.org/Search_API_V3)
- [Authentication (2025)](https://wiki.openfoodfacts.org/Food_Logging_Data_Standard)
- [Data Usage Policy](https://world.openfoodfacts.org/data)

---

### 2. USDA FoodData Central

**Overview**: Official U.S. government nutrition database with 300K+ foods

#### Key Details

| Attribute | Value |
|-----------|-------|
| **API Endpoint** | `https://api.nal.usda.gov/fdc/v1/` |
| **Authentication** | API Key required (free signup) |
| **Free Tier** | ✅ **100% FREE** - Government resource |
| **Database Size** | 300,000+ foods (US-focused) |
| **Barcode Support** | ✅ UPC/barcode search available |
| **Rate Limits** | No explicit limits mentioned |
| **Commercial Use** | ✅ Allowed (public domain) |
| **JavaScript SDK** | ✅ Multiple npm packages available |

#### Data Returned

- ✅ **Comprehensive nutritional data** (100+ nutrients)
- ✅ **Ingredient lists** (limited)
- ❌ **Additives data** (not primary focus)
- ✅ **Portion sizes** and serving weights
- ✅ **Nutrient retention data**
- ✅ **Scientific name** and food classification

#### Pricing

- **FREE**: Unlimited access (public domain data)
- **Requirement**: Sign up for API key at fdc.nal.usda.gov

#### Pros

- ✅ **Completely free** with no usage limits
- ✅ **High data quality** (government-curated)
- ✅ **Unlimited access** (no rate limits)
- ✅ **Public domain** - no licensing issues
- ✅ **Multiple TypeScript SDKs** available:
  - `@jlfwong/food-data-central-mcp-server`
  - `fooddata-central` by metonym
  - `food-ingredients-database` by EduardoAC

#### Cons

- ❌ **US-focused** (limited international products)
- ❌ **Weak additives data** (not a primary feature)
- ❌ **Smaller database** (300K vs 3M+ for Open Food Facts)
- ❌ **Requires API key** signup
- ⚠️ **Product coverage gaps** for packaged foods

#### Documentation Links

- [Main Website](https://fdc.nal.usda.gov/)
- [API Guide](https://fdc.nal.usda.gov/api-guide)
- [API Key Signup](https://fdc.nal.usda.gov/api-key-signup)
- [Node.js Client](https://github.com/metonym/fooddata-central)
- [TypeScript CLI](https://github.com/EduardoAC/food-ingredients-database)

---

### 3. Edamam Food Database API

**Overview**: Commercial nutrition API with 900K foods and 680K+ UPC codes

#### Key Details

| Attribute | Value |
|-----------|-------|
| **API Endpoint** | `https://api.edamam.com/api/food-database/v2/` |
| **Authentication** | App ID + App Key |
| **Free Tier** | ✅ Available (developers/startups/non-profits) |
| **Database Size** | ~900,000 foods |
| **Barcode Support** | ✅ 680,000+ UPC/barcode codes |
| **Rate Limits** | Limited (free tier restrictions apply) |
| **Commercial Use** | Paid tiers required |
| **JavaScript SDK** | Official SDK available |

#### Data Returned

- ✅ **Ingredient lists**
- ✅ **Nutritional information**
- ✅ **Category classification**
- ❌ **Additives data** (limited)
- ✅ **Natural language parsing**

#### Pricing

- **Free Tier**: Available for development/non-commercial use
- **Basic Plan**: Low-cost (pricing not publicly listed)
- **Enterprise**: Custom pricing

#### Pros

- ✅ **Free tier available** for development
- ✅ **Decent barcode coverage** (680K+ UPCs)
- ✅ **Official SDK** and good documentation
- ✅ **Natural language processing** capabilities
- ✅ **Nutrition Analysis API** also available

#### Cons

- ❌ **Paid tiers required** for commercial use
- ❌ **Free tier has rate limits**
- ❌ **Weak additives data**
- ❌ **Smaller database** than Open Food Facts
- ❌ **Pricing not transparent** (contact for quotes)

#### Documentation Links

- [Main Website](https://www.edamam.com/)
- [Developer Portal](https://developer.edamam.com/food-database-api)

---

### 4. Nutritionix API

**Overview**: Largest branded food database with 1M+ grocery foods

#### Key Details

| Attribute | Value |
|-----------|-------|
| **API Endpoint** | `https://api.nutritionix.com/v2/` |
| **Authentication** | App ID + App Key |
| **Free Tier** | ⚠️ Limited (10K queries/day for non-commercial) |
| **Database Size** | 1M+ grocery foods + 203K restaurant foods |
| **Barcode Support** | ✅ Full barcode lookup |
| **Rate Limits** | 10,000 queries/day (free tier) |
| **Commercial Use** | ❌ Business Trial: $499/month, Starter: $999/month |
| **JavaScript SDK** | Official SDK available |

#### Data Returned

- ✅ **Nutritional information**
- ✅ **Product metadata** (brand, category)
- ❌ **Ingredient lists** (limited)
- ❌ **Additives data** (not a focus)
- ✅ **Restaurant menu data**

#### Pricing

| Plan | Price | Usage |
|------|-------|-------|
| **Free** | $0 | 10K queries/day, non-commercial only |
| **Business Trial** | $499/month | Commercial use, higher limits |
| **Starter** | $999/month | Production-ready |
| **Enterprise** | Custom | High volume |

#### Pros

- ✅ **Largest branded food database** (1M+ grocery items)
- ✅ **Restaurant data** (203K items)
- ✅ **Barcode lookup** supported
- ⚠️ **Free tier available** (but non-commercial only)

#### Cons

- ❌ **Expensive for commercial use** ($499-$999/month)
- ❌ **No ingredients/additives data** (nutrition only)
- ❌ **Rate limited** (10K/day free tier)
- ❌ **Non-commercial only** for free tier

#### Documentation Links

- [Official API Page](https://www.nutritionix.com/api)
- [Developer Portal](https://developer.nutritionix.com/)

---

### 5. FatSecret Platform API

**Overview**: Global nutrition database with coverage in 56+ countries

#### Key Details

| Attribute | Value |
|-----------|-------|
| **API Endpoint** | `https://platform.fatsecret.com/api/` |
| **Authentication** | OAuth 1.0a |
| **Free Tier** | ⚠️ Not publicly disclosed |
| **Database Size** | Large (claim "largest global") |
| **Barcode Support** | ✅ Supported |
| **Rate Limits** | Not publicly disclosed |
| **Commercial Use** | Contact for pricing |
| **JavaScript SDK** | Unofficial wrappers available |

#### Data Returned

- ✅ **Nutritional information**
- ✅ **Barcode lookup**
- ❌ **Ingredients/additives** (limited data)

#### Pricing

- **Pricing**: Not publicly listed (contact sales)
- **Free Tier**: Likely available for development (unconfirmed)

#### Pros

- ✅ **Global coverage** (56+ countries)
- ✅ **Barcode support**
- ✅ **Unofficial npm wrapper** available

#### Cons

- ❌ **Pricing not transparent**
- ❌ **Limited ingredients/additives data**
- ❌ **OAuth 1.0a** (complicated vs. API keys)
- ❌ **Documentation quality unknown**

#### Documentation Links

- [Platform API](https://platform.fatsecret.com/platform-api)
- [Unofficial Node.js Wrapper](https://github.com/muezz/fatsecret)

---

### 6. Barcode Lookup API

**Overview**: Dedicated barcode lookup service for UPC/EAN/ISBN

#### Key Details

| Attribute | Value |
|-----------|-------|
| **API Endpoint** | `https://api.barcodelookup.com/v3/` |
| **Authentication** | API Key |
| **Free Tier** | ⚠️ Limited (check website) |
| **Database Size** | Not disclosed |
| **Barcode Support** | ✅ Core feature (UPC, EAN, ISBN) |
| **Rate Limits** | Based on plan |
| **Commercial Use** | Paid plans required |
| **JavaScript SDK** | REST API only |

#### Data Returned

- ✅ **Product metadata** (name, brand, category)
- ✅ **Images**
- ❌ **Ingredients** (not a focus)
- ❌ **Nutritional data**
- ❌ **Additives**

#### Pricing

- **Free Tier**: Available (limits not disclosed)
- **Paid Plans**: Check website for current pricing

#### Pros

- ✅ **Specialized in barcodes**
- ✅ **Simple, focused service**

#### Cons

- ❌ **No nutritional data**
- ❌ **No ingredients/additives**
- ❌ **Not suitable** for Molly Food Scanner's needs

#### Documentation Links

- [API Documentation](https://www.barcodelookup.com/api)

---

## Comparison Table

| API | Barcode Lookup | Ingredients | Additives | Free Tier | Pricing | Database Size | JS/TS SDK |
|-----|---------------|-------------|-----------|-----------|---------|---------------|-----------|
| **Open Food Facts** ⭐ | ✅ Yes | ✅ Full | ✅ Rich E-number data | ✅ **100% FREE** | FREE (premium available) | **3M+** (global) | Community wrappers |
| **USDA FoodData Central** | ✅ Yes | ⚠️ Limited | ❌ None | ✅ **100% FREE** | FREE (public domain) | 300K (US-focused) | ✅ Multiple npm packages |
| **Edamam** | ✅ Yes (680K+) | ✅ Yes | ⚠️ Limited | ✅ Available | Free tier + paid plans | 900K | ✅ Official SDK |
| **Nutritionix** | ✅ Yes | ❌ Limited | ❌ None | ⚠️ Non-commercial only | $499-$999/month commercial | **1M+ grocery** + 203K restaurant | ✅ Official SDK |
| **FatSecret** | ✅ Yes | ⚠️ Limited | ❌ None | ⚠️ Unknown | Contact for pricing | Large (global) | Unofficial wrappers |
| **Barcode Lookup** | ✅ Yes | ❌ No | ❌ No | ⚠️ Limited | Paid plans | Not disclosed | REST API only |

---

## Recommendation

### 🏆 Primary Recommendation: Open Food Facts

**For Molly Food Scanner MVP**, **Open Food Facts** is the clear winner for the following reasons:

#### 1. **Cost (Critical for MVP)**
- **100% FREE** with no API key required
- No usage limits for legitimate scanning use cases
- No surprise costs or tier upgrades needed

#### 2. **Data Completeness (Critical for User Value)**
- **Rich additives data** with E-number classifications
- **Complete ingredient lists** parsed hierarchically
- **Allergen tracking** (contains, traces, may contain)
- **Nutri-Score** for health assessment
- **Nova Group** for ultra-processed detection

#### 3. **Database Size**
- **3M+ products globally** (10x larger than USDA)
- **International coverage** (not US-only)
- **Community-maintained** (constantly updated)

#### 4. **Proven at Scale**
- Powers **Yuka** app (millions of users)
- Used by multiple food scanning apps globally
- Battle-tested API infrastructure

#### 5. **Ease of Integration**
- Simple **RESTful JSON API**
- No authentication required for basic reads
- Straightforward response structure
- Next.js/TypeScript integration is trivial

#### 6. **Licensing**
- **Open Database License (ODBL)**
- Commercial use allowed with attribution
- No restrictive EULAs

---

### 🥈 Secondary Option: USDA FoodData Central

Use **USDA FoodData Central** as a **fallback/complement** for:

- **US-market validation** of nutritional data
- **Hybrid approach**: Open Food Facts for global coverage, USDA for US product verification
- **Backup API** when Open Food Facts has data gaps

**Why it's not the primary choice:**
- ❌ US-focused (limited for international users)
- ❌ Weak additives data (critical for Molly's use case)
- ❌ Smaller database (300K vs 3M+)

---

## Implementation Strategy

### Phase 1: MVP (Open Food Facts Only)

```typescript
// Simple barcode lookup implementation
async function lookupProduct(barcode: string) {
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
  );
  const data = await response.json();

  return {
    name: data.product.product_name,
    ingredients: data.product.ingredients_text,
    additives: data.product.additives_tags,
    allergens: data.product.allergens_tags,
    nutriScore: data.product.nutriscore_grade,
    novaGroup: data.product.nova_group,
    image: data.product.image_front_url
  };
}
```

**Benefits:**
- Zero cost
- Minimal code complexity
- Immediate deployment capability
- Rich data for additives analysis

### Phase 2: Hybrid Approach (Open Food Facts + USDA)

If needed, add USDA as fallback:

```typescript
async function lookupProductWithFallback(barcode: string) {
  // Try Open Food Facts first
  const offResult = await lookupOpenFoodFacts(barcode);
  if (offResult.success) return offResult;

  // Fallback to USDA
  const usdaResult = await lookupUSDA(barcode);
  return usdaResult;
}
```

**Benefits:**
- Increased coverage
- US market validation
- Government data reliability

### Phase 3: Commercial Scaling

If application scales to enterprise level:
- Evaluate paid APIs (Nutritionix, Edamam) for specific needs
- Consider Open Food Facts premium API for high-volume use
- Implement caching to reduce API calls

---

## Technical Implementation Notes

### TypeScript/JavaScript Packages

#### For Open Food Facts (Recommended)

No official SDK needed - simple `fetch()` calls:

```typescript
// No npm package required
const OFF_BASE_URL = 'https://world.openfoodfacts.org/api/v0';

export interface OFFProduct {
  code: string;
  product: {
    product_name: string;
    ingredients_text: string;
    additives_tags: string[];
    allergens_tags: string[];
    nutriscore_grade: string;
    nova_group: number;
    image_front_url: string;
  };
}
```

#### For USDA (Optional Fallback)

```bash
npm install fooddata-central
# or
npm install @jlfwong/food-data-central-mcp-server
```

### API Response Structure (Open Food Facts)

```json
{
  "code": "7622210449283",
  "status": 1,
  "product": {
    "product_name": "Nutella",
    "ingredients_text": "Sugar, palm oil, hazelnuts...",
    "additives_tags": [
      "en:e407",
      "en:e412"
    ],
    "additives_original_tags": [
      "Carrageenan",
      "Guar gum"
    ],
    "allergens_tags": [
      "en:hazelnuts",
      "en:milk"
    ],
    "nutriscore_grade": "e",
    "nova_group": 4,
    "image_front_url": "https://images.openfoodfacts.org/..."
  }
}
```

---

## Cost Analysis for MVP

| API | Monthly Cost | Annual Cost | Notes |
|-----|--------------|-------------|-------|
| **Open Food Facts** | **$0** | **$0** | Recommended |
| USDA | $0 | $0 | Fallback option |
| Edamam | $0-$99+ | $0-$1,188+ | Free tier limits |
| Nutritionix | $499+ | $5,988+ | Commercial use required |

**MVP Cost with Open Food Facts: $0**

---

## Rate Limit Analysis

### Open Food Facts
- **Policy**: "1 API call = 1 real scan by a user"
- **Enforcement**: Vague, community reports show tolerance for legitimate use
- **Recommendation**: Implement caching, respect rate limits (10 req/sec safe)

### USDA
- **Limits**: None publicly documented
- **Recommendation**: Still implement caching to be respectful

---

## Data Quality Comparison

| Aspect | Open Food Facts | USDA | Nutritionix |
|--------|----------------|------|-------------|
| **Additives** | ⭐⭐⭐⭐⭐ E-numbers, categories, risks | ⭐ Not a focus | ⭐ Not available |
| **Ingredients** | ⭐⭐⭐⭐⭐ Full hierarchical lists | ⭐⭐⭐ Limited | ⭐⭐ Basic |
| **Nutrition** | ⭐⭐⭐⭐ Comprehensive | ⭐⭐⭐⭐⭐ Scientific-grade | ⭐⭐⭐⭐ Comprehensive |
| **Coverage** | ⭐⭐⭐⭐⭐ Global (3M+) | ⭐⭐⭐ US (300K) | ⭐⭐⭐⭐ US brands (1M+) |
| **Accuracy** | ⭐⭐⭐ Community-edited | ⭐⭐⭐⭐⭐ Government-curated | ⭐⭐⭐⭐ Brand-provided |

---

## Potential Risks & Mitigation

### Risk 1: Open Food Facts Data Quality
- **Risk**: Community-edited, may have errors
- **Mitigation**: Cross-check with USDA for US products, user reporting system

### Risk 2: Rate Limiting
- **Risk**: Fair use policy vaguely defined
- **Mitigation**: Implement caching (Redis/local), rate limiting middleware

### Risk 3: API Availability
- **Risk**: Open Food Facts is donation-funded
- **Mitigation**: USDA fallback, data export capability for offline mode

### Risk 4: Commercial Terms
- **Risk**: Open Food Facts attribution requirements
- **Mitigation**: Add "Powered by Open Food Facts" in UI, comply with ODBL license

---

## Next Steps for Development

1. **Implement Open Food Facts Integration**
   - Create API service in `src/services/open-food-facts.ts`
   - Implement barcode lookup endpoint
   - Add response caching (Redis or local)

2. **Add Error Handling**
   - Fallback to USDA if needed
   - Graceful degradation for missing data
   - User feedback for product corrections

3. **UI Development**
   - Barcode scanner integration (already done)
   - Product display with additives highlighting
   - Nutri-Score visualization

4. **Testing**
   - Test with 100+ common products
   - Validate additives extraction accuracy
   - Performance testing (API response times)

---

## Conclusion

**Open Food Facts** is the optimal choice for Molly Food Scanner's MVP:

✅ **Zero cost** (critical for bootstrapping)
✅ **Rich additives data** (core feature for Molly)
✅ **Global coverage** (international users)
✅ **Proven at scale** (Yuka, others)
✅ **Simple integration** (RESTful API)
✅ **Open license** (commercial use allowed)

**USDA FoodData Central** serves as an excellent fallback for US-market validation.

**Paid APIs** (Nutritionix, Edamam) are unnecessary until proven scale requirements emerge.

---

## Sources

### Open Food Facts
- [API Introduction](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Barcode/Product Lookup](https://wiki.openfoodfacts.org/API/Read/Product)
- [Search API V3](https://wiki.openfoodfacts.org/Search_API_V3)
- [Authentication Documentation](https://wiki.openfoodfacts.org/Food_Logging_Data_Standard)
- [Data Usage Policy](https://world.openfoodfacts.org/data)
- [Open Food Facts Auth Project](https://github.com/openfoodfacts/openfoodfacts-auth)
- [Barcodes Documentation](https://wiki.openfoodfacts.org/Barcodes)

### USDA FoodData Central
- [Main Website](https://fdc.nal.usda.gov/)
- [API Guide](https://fdc.nal.usda.gov/api-guide)
- [API Key Signup](https://fdc.nal.usda.gov/api-key-signup)
- [Node.js Client (metonym)](https://github.com/metonym/fooddata-central)
- [TypeScript CLI (EduardoAC)](https://github.com/EduardoAC/food-ingredients-database)

### Nutritionix
- [Official API Page](https://www.nutritionix.com/api)
- [Developer Portal](https://developer.nutritionix.com/)
- [Reddit Discussion](https://www.reddit.com/r/Nutritionix/comments/15p24q/general_discussion_questions/)

### Edamam
- [Main Website](https://www.edamam.com/)
- [Developer Portal](https://developer.edamam.com/food-database-api)

### Other Resources
- [Top Nutrition APIs 2026](https://spikeapi.com/blog/top-nutrition-apis-for-developers-2026)
- [Best Food API for Ingredients (Reddit)](https://www.reddit.com/r/reactnative/comments/16f74ci/best_food_api_for_ingredients/)
- [Barcode Lookup API](https://www.barcodelookup.com/api)
- [FatSecret Platform API](https://platform.fatsecret.com/platform-api)
- [Top 8 Nutrition APIs 2024](https://www.eatfresh.tech/blog/top-8-nutrition-apis-for-meal-planning-2024)
- [COMPARE Allergen Database](https://comparedatabase.org/)
- [Bytes AI Nutrition Data](https://trybytes.ai/blogs/best-apis-for-menu-nutrition-data)

### JavaScript/TypeScript SDKs
- [USDA FoodData Central npm](https://www.npmjs.com/package/usda-food-data-api-schema)
- [Food-Ingredients-Database (GitHub)](https://github.com/EduardoAC/food-ingredients-database)
- [FatSecret Wrapper (GitHub)](https://github.com/muezz/fatsecret)

---

**Document Status**: ✅ Complete
**Next Contract**: R2 - Ingredient Analysis Algorithms
