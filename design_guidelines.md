# Design Guidelines: KDP Optimizer AI Application

## Design Approach

**Selected Approach:** Design System-Based (Productivity Application)  
**Primary Reference:** Linear + Notion design principles  
**Rationale:** This is a utility-focused productivity tool requiring efficiency, clarity, and professional presentation of complex data. Users need to process information quickly and copy results accurately.

## Core Design Principles

1. **Functional Clarity:** Every element serves a clear purpose in the workflow
2. **Information Hierarchy:** Guide users through the multi-step optimization process
3. **Content Readability:** Generated metadata must be easily scannable and copyable
4. **Progressive Disclosure:** Show complexity only when needed
5. **Trust Signals:** Professional appearance builds confidence in AI-generated recommendations

---

## Color Palette

### Light Mode
- **Background Primary:** 0 0% 100% (pure white)
- **Background Secondary:** 240 5% 96% (light gray for panels)
- **Text Primary:** 240 10% 10% (near black)
- **Text Secondary:** 240 5% 45% (medium gray)
- **Primary Brand:** 215 85% 55% (professional blue - trust and technology)
- **Success:** 145 65% 45% (green for completed steps)
- **Warning:** 35 90% 55% (amber for attention items)
- **Border:** 240 6% 90% (subtle dividers)

### Dark Mode
- **Background Primary:** 240 10% 8%
- **Background Secondary:** 240 8% 12%
- **Text Primary:** 0 0% 95%
- **Text Secondary:** 240 5% 65%
- **Primary Brand:** 215 85% 60% (slightly brighter for contrast)
- **Success:** 145 60% 50%
- **Warning:** 35 85% 60%
- **Border:** 240 6% 20%

---

## Typography

**Font Stack:**
- **Primary:** Inter (via Google Fonts) - clean, professional, excellent at small sizes
- **Monospace:** JetBrains Mono - for code/HTML output display

**Type Scale:**
- **Display (Hero):** 3xl font-bold (dashboard title)
- **Page Headers:** 2xl font-semibold
- **Section Headers:** xl font-semibold
- **Subsections:** lg font-medium
- **Body Text:** base font-normal
- **Metadata/Labels:** sm font-medium
- **Helper Text:** xs font-normal text-secondary

**Key Contexts:**
- **Form Labels:** sm font-medium uppercase tracking-wide
- **Generated Content:** base font-normal with generous line-height (1.6)
- **Code Blocks (HTML):** sm font-mono with syntax highlighting consideration

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16, 24  
**Common Patterns:**
- Component padding: p-6 to p-8
- Section spacing: space-y-8 to space-y-12
- Form field gaps: gap-4 to gap-6
- Card margins: m-4 to m-6

**Container Strategy:**
- **Max Width:** max-w-6xl for main content (optimal for forms and results)
- **Sidebar (if used):** w-64 fixed for navigation/progress tracking
- **Results Panels:** max-w-4xl for readability of generated text

**Grid Patterns:**
- **Upload Section:** Single column, centered, max-w-2xl
- **Configuration Form:** 2-column grid on desktop (md:grid-cols-2), single on mobile
- **Results Display:** Stacked cards with tabbed interface for multiple markets

---

## Component Library

### Navigation & Layout
**Top Navigation Bar:**
- Fixed header with logo (left), progress indicator (center), account/settings (right)
- Height: h-16, background: bg-white dark:bg-gray-950 with subtle border-b
- Contains: Application name, current step indicator, user menu

**Sidebar (Optional):**
- Left-side navigation showing workflow steps
- Visual progress: completed steps with checkmarks, current step highlighted, future steps dimmed
- Sticky positioning for easy reference

### Forms & Inputs
**File Upload Zone:**
- Large drag-and-drop area with dashed border (border-2 border-dashed)
- Icon: document upload graphic (200x200 size)
- States: default, hover (border-primary), active (bg-primary-50), uploaded (border-success)
- Shows file preview: filename, size, word count

**Form Fields:**
- **Text Inputs:** Rounded corners (rounded-lg), clear labels above, helper text below
- **Select Dropdowns:** Multi-select for markets with checkboxes, single-select for language
- **Radio Groups:** For genre selection with cards (not just radio buttons)
- Validation states: border-red for errors with icon and message

**Buttons:**
- **Primary CTA:** bg-primary text-white px-6 py-3 rounded-lg font-medium with loading spinner state
- **Secondary:** border border-gray-300 bg-white text-gray-700 hover:bg-gray-50
- **Text Buttons:** For cancel/back actions, text-primary underline-on-hover

### Content Display
**Results Cards:**
- White/dark-mode background with rounded-xl and subtle shadow
- **Header:** Market flag icon + name (e.g., "🇺🇸 Amazon.com"), border-b separator
- **Sections:** Each metadata type in collapsible accordion or tabbed interface
- **Copy Button:** On each section with visual feedback (checkmark animation on click)

**Code Display (HTML Description):**
- Monospace font in bordered container
- Syntax highlighting for HTML tags (basic: tags in blue, attributes in amber)
- "Copy to Clipboard" button positioned top-right
- Line numbers for reference

**Keyword Lists:**
- Numbered list (1-7) with each field in its own container
- Character count indicator per field (e.g., "142/249 bytes")
- Visual warning if approaching limit

**Price Recommendations:**
- Table format showing: Market, Currency, Recommended Price, Royalty %, Estimated Earnings
- Highlight recommended option with subtle bg-primary-50 background

### Feedback & Progress
**Loading States:**
- Full-screen overlay during AI processing with:
  - Animated spinner (not too fast - deliberate pace)
  - Step-by-step progress messages (e.g., "Analyzing manuscript...", "Researching keywords for amazon.de...")
  - Estimated time remaining if possible

**Status Indicators:**
- **Success Messages:** Green banner with checkmark icon
- **Error Messages:** Red banner with alert icon and clear action steps
- **Info Messages:** Blue banner for tips and guidance

**Progress Bar:**
- Linear progress showing overall completion (0-100%)
- Step indicators: Upload → Configure → Analyze → Results
- Current step highlighted, completed steps with checkmarks

### Data Visualization
**Keyword Confidence Indicators:**
- Badge-style tags showing keyword quality: "High Demand" (green), "Low Competition" (blue), "Long-tail" (purple)
- Small chips, not overwhelming

**Category Recommendations:**
- Tree-view or breadcrumb display showing category hierarchy
- Primary category highlighted differently than niche categories

---

## Interaction Patterns

**Workflow Progression:**
- Clear "Next" and "Back" buttons at bottom of each step
- Auto-save form inputs to prevent data loss
- Ability to edit previous steps without losing progress

**Copy Functionality:**
- Single-click copy for each metadata field
- Visual feedback: button changes to "Copied!" with checkmark for 2 seconds
- Copy entire market results set with one button

**Market Tabs:**
- Horizontal tabs for switching between market results (amazon.com, amazon.es, etc.)
- Active tab clearly highlighted with underline or background
- Lazy loading of tabs if needed for performance

---

## Visual Enhancements

**Empty States:**
- Friendly illustrations/icons for empty upload zone
- Clear instructions: "Drag and drop your manuscript here or click to browse"

**Success Confirmation:**
- After successful generation, show summary card with key stats:
  - Markets optimized, keywords generated, estimated time saved
  - Prominent "Download Full Report" or "Start New Optimization" buttons

**Micro-interactions:**
- Smooth transitions between steps (300ms ease-in-out)
- Button hover states with subtle scale or color shift
- Form field focus states with border color change and subtle glow

---

## Professional Touches

**Dashboard Header:**
- Welcome message: "Welcome back, [Author Name]"
- Quick stats: Books optimized, Markets covered, Success rate

**Onboarding (First Use):**
- Brief tooltip tour highlighting key features
- Optional video or help documentation link

**Export Options:**
- Download results as formatted PDF
- Export as JSON for programmatic use
- Print-friendly view

**Trust Elements:**
- "Powered by OpenAI" badge (subtle)
- Data privacy note: "Your manuscript is processed securely and not stored"
- Link to methodology explanation

---

## Accessibility & Quality

- Minimum touch target size: 44x44px for all interactive elements
- WCAG AA contrast ratios maintained throughout
- Keyboard navigation fully supported with visible focus indicators
- Screen reader labels for all icons and interactive elements
- Form fields with proper label associations and error announcements
- Dark mode fully implemented with same level of polish as light mode