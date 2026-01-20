# Molly Food Scanner - Implementation Contracts

## Project Vision
**Answer the question: "Is this food bad for me?"**

By uploading a picture of food packaging, users get:
- AI analysis of ingredients and chemicals
- Health impact rating
- Personalized based on their preferences
- Interactive chat to ask follow-up questions

---

## Phase 1: MVP - Image Upload + AI Analysis (P0)

### Contract M1: Image Upload Functionality
**Assigned to**: Codex Agent 1
**Validated by**: Claude + Deepseek
**Status**: ⚠️ NEEDS_REVIEW

**Note**: Code existed pre-contract. Validation FAILED on 2025-01-15. Implementation credit needs assessment or re-implementation.

**Requirements**:
- [x] User can upload food image via drag-drop
- [x] User can upload food image via file picker
- [x] Show preview of uploaded image
- [x] Display loading state during AI analysis
- [x] Handle image file validation (type, size)

**Acceptance Criteria**:
- Can upload .jpg, .png, .webp images up to 5MB
- Preview displays correctly
- Loading state shows "Analyzing your food..."
- Errors are user-friendly

**Completion**: Image uploads work, ready for AI integration

---

### Contract M2: AI Analysis via Deepseek API
**Assigned to**: Codex Agent 2
**Validated by**: Claude + Deepseek
**Status**: ✅ COMPLETED (2025-01-20)

**Note**: Phase 1 BLOCKER resolved. DeepseekProvider implemented, replacing mock-only LocalProvider. AI analysis now functional.

**Implementation**:
- [x] DeepseekProvider created (OpenAI-compatible API)
- [x] AIProviderFactory updated with deepseek type
- [x] Environment configured (DEEPSEEK_API_KEY, BASE_URL, MODEL)
- [x] Fallback chain: deepseek → openai → local
- [x] POST /api/analyze uses service layer
- [x] Receives analysis results (food name, chemicals, rating)
- [x] Error handling with user-friendly messages

**Acceptance Criteria**:
- Can analyze uploaded food image
- Shows food name, chemicals found, health rating
- Works with sample food images
- Error handling if AI is unavailable

**Completion**: End-to-end: Upload → Analyze → Display Results

---

### Contract M3: Display Results (Rating + Chemicals)
**Assigned to**: Codex Agent 3
**Validated by**: Claude + Deepseek
**Status**: ✅ EXISTS (2025-01-20)

**Note**: FoodCard component exists and is tested. Requires M2 (AI Analysis) to display real data.

**Requirements**:
- [x] FoodCard component displays analysis results
- [x] Health rating shown as color-coded meter
- [x] Chemicals list expandable (show what's bad)
- [x] Clear visual indicators (good/caution/bad)

**Acceptance Criteria**:
- Results display clearly after analysis
- Rating meter is intuitive (red=bad, green=good, yellow=caution)
- Chemicals show severity levels
- User can add foods to their "avoid" list

**Completion**: Full results display with interactivity

---

## Phase 2: Chat Interface (P1)

### Contract M4: Chat with AI
**Assigned to**: Codex Agent 4
**Validated by**: Claude + Deepseek
**Status**: ⚠️ PARTIAL (2025-01-20)

**Note**: chat-deepseek route exists and works. Not fully integrated with main UI flow. Standalone endpoint functional.

**Requirements**:
- [x] ChatInterface component with message history
- [x] POST /api/chat-deepseek route exists
- [x] User can ask questions
- [ ] Streaming AI responses (AI SDK UX patterns)
- [ ] Chat remembers food context

**Acceptance Criteria**:
- Chat works with analyzed food
- Responses stream in real-time
- Can ask follow-up questions
- Message history persists during session

**Completion**: Interactive chat about food

---

## Phase 2: Database Lookup (P2)

### Contract M5: Barcode Scanner
**Assigned to**: Codex Agent 5
**Validated by**: Claude + Deepseek
**Status**: ❌ NOT_IMPLEMENTED (2025-01-20)

**Note**: Barcode scanning not implemented. API accepts barcode_text but no camera/scanner integration.

**Requirements**:
- [ ] Camera access in UploadArea
- [ ] Barcode scanning functionality
- [ ] Lookup barcode in foods.json database
- [ ] Display results if found
- [ ] Fall back to AI analysis if not found

**Acceptance Criteria**:
- Can scan barcodes with camera
- Database lookup works
- Shows food info if in database
- AI fallback works for unknown items

**Completion**: Barcode scanning + DB lookup

---

## Research Contracts (Gemini Agents)

### Research R1: Food Database APIs
**Assigned to**: Gemini Agent 1
**Validated by**: Claude + Deepseek
**Status**: ❌ NOT_STARTED (2025-01-20)

**Requirements**:
- [ ] Research available food database APIs
- [ ] Document API integration process
- [ ] Find best practices for food data
- [ ] Recommend which API(s) to use

**Deliverable**:
- Research document with recommendations
- Integration guide for chosen API(s)
- Sample queries

---

### Research R2: Barcode Scanning Libraries
**Assigned to**: Gemini Agent 2
**Validated by**: Claude + Deepseek
**Status**: ❌ NOT_STARTED (2025-01-20)

**Requirements**:
- [ ] Research barcode scanning for web
- [ ] Find JavaScript libraries (QuaggaJS, etc.)
- [ ] Test library capabilities
- [ ] Document implementation guide

**Deliverable**:
- Library recommendation with examples
- Integration code sample
- Known limitations

---

### Research R3: Chemical Additives Knowledge Base
**Assigned to**: Gemini Agent 3
**Validated by**: Claude + Deepseek
**Status**: ❌ NOT_STARTED (2025-01-20)

**Requirements**:
- [ ] Research common harmful additives
- [ ] Find authoritative sources (EFSA, FDA, etc.)
- [ ] Document top 20 additives to avoid
- [ ] Populate chemical-risks.md with real data

**Deliverable**:
- Comprehensive chemicals database
- Source citations
- Risk categorization

---

## Governance

### @agents-finality Setup
**Pre-commit hooks**:
- Run tests before allowing commit
- Validate contracts are fulfilled
- Deepseek validation passes
- Claude validation passes

### Contract States
- **pending**: Not started
- **in_progress**: Being worked on
- **validation**: Under review
- **completed**: Validated and done

---

## Session State

**Current Phase**: Phase 1 Complete - AI Integration via Deepseek (2025-01-20)

**Contract Status Summary**:
- M1: ⚠️ NEEDS_REVIEW (code existed pre-contract, validation failed)
- M2: ✅ COMPLETED (Deepseek AI integration working)
- M3: ✅ EXISTS (FoodCard component ready, needs M2 data)
- M4: ⚠️ PARTIAL (chat-deepseek route exists, not integrated)
- M5: ❌ NOT_IMPLEMENTED (barcode scanner not done)
- R1-R3: ❌ NOT_STARTED (research pending)

**Next Actions**:
1. Phase 3: Finality governance validation of M2
2. Phase 4: Production readiness validation
3. M5: Implement barcode scanner
4. R1-R3: Execute research contracts

**MVP Success Criteria**:
- ✅ User can upload food image
- ✅ AI analyzes and returns results (via Deepseek)
- ✅ User sees "Is this bad for me?" answer
- ✅ Can add foods to "avoid" list

---

**Status**: Phase 1 AI Integration COMPLETE. Moving to Phase 3-4 validation.
