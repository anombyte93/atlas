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

**Requirements**:
- [ ] User can upload food image via drag-drop
- [ ] User can upload food image via file picker
- [ ] Show preview of uploaded image
- [ ] Display loading state during AI analysis
- [ ] Handle image file validation (type, size)

**Acceptance Criteria**:
- Can upload .jpg, .png images up to 5MB
- Preview displays correctly
- Loading state shows "Analyzing your food..."
- Errors are user-friendly

**Completion**: Image uploads work, ready for AI integration

---

### Contract M2: AI Analysis via mcp-cli
**Assigned to**: Codex Agent 2
**Validated by**: Claude + Deepseek

**Requirements**:
- [ ] POST /api/analyze calls mcp-cli server
- [ ] Sends image to Molly Food Analyzer agent
- [ ] Receives analysis results (food name, chemicals, rating)
- [ ] Displays results in FoodCard component
- [ ] Handles errors gracefully

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

**Requirements**:
- [ ] FoodCard component displays analysis results
- [ ] Health rating shown as color-coded meter
- [ ] Chemicals list expandable (show what's bad)
- [ ] "Add to bad foods" button
- [ ] Clear visual indicators (good/caution/bad)

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

**Requirements**:
- [ ] ChatInterface component with message history
- [ ] User can ask: "What chemicals are in this?"
- [ ] User can ask: "Why is this bad for me?"
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

**Current Phase**: Phase 1 - MVP (Image Upload + AI Analysis)

**Next Actions**:
1. Codex 1: Image upload functionality
2. Codex 2: AI analysis integration
3. Codex 3: Results display
4. Gemini 1: Food database research
5. Gemini 2: Barcode library research

**MVP Success Criteria**:
- ✅ User can upload food image
- ✅ AI analyzes and returns results
- ✅ User sees "Is this bad for me?" answer
- ✅ Can add foods to "avoid" list

---

**Status**: Ready to begin with 5x Codex + 3x Gemini execution
