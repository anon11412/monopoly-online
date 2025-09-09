# Changelog

## 2025-09-09

### Home Screen Redesign (Main Page)

#### Layout & Structure
- Hero section centers a prominent **Connect** button (primary CTA) using theme colors and high contrast.
- Page split into two conceptual halves:
  1. Top hero (branding + Connect CTA)
  2. Bottom informational section (overview, features, visuals)

#### Informational Section
- Game Overview: Brief explanation of core loop (roll, acquire, invest, trade, outlast opponents).
- How to Win: One concise paragraph describing last-player-standing / solvency objective.
- Core Features list (each in a modern rounded card with small icon/screenshot snippet):
  - Stocks: invest in other players for strategic depth.
  - Auto-Roll: streamline turns for faster pacing.
  - Trading: classic + advanced multi-asset deals.
  - Functions: per-turn payments, rental agreements, stock ownership transfers, etc.
- Visuals: Placeholder/sample images for board layout, stock/investment panel, and auto-action settings (to be replaced with live captures).

#### Style
- Modern card UI with subtle shadow, rounded corners, consistent padding.
- Responsive layout: Connect button remains centered on all breakpoints; images scale fluidly.
- Theming integrated: respects existing light/dark theme variables (colors, fonts, borders).

#### Behavior
- Scroll split model: Users can scroll to reveal the informational section, or layout can display a split “above fold” hero and below fold details.
- Connect CTA persistent visibility: Button remains visible (sticky / pinned) as user scrolls so it’s never lost.

### Trade Sounds — Volume & Prominence

#### Pending Trades
- Distinct pending trade creation sound plays every time a new pending trade is created (no throttling). 
- Increased volume / prominence of pending trade sound for clearer detection in active sessions.

#### Trade Acceptance / Denial
- Acceptance sound made more prominent and slightly louder than pending creation tone; distinct waveform/texture.
- Denial sound remains unique with balanced volume—clearly noticeable but not jarring.

#### QA Verification Checklist
- New pending trade reliably triggers sound (manually and via automated test scenario).
- Acceptance sound audibly louder & distinct versus pending trade sound.
- Denial sound fires only on explicit denial events.
- No UI button click sounds for routine trade UI interactions—only event-driven sounds fire.

#### Implementation Notes
- Increased base volumes: trade_created (~+0.15), trade_accepted (~+0.15 with longer envelope), trade_denied slight pitch & envelope tweak.
- Differentiated frequencies across sound packs (classic/retro/modern) to strengthen recognition.
- Lint cleanup on unused audio context vars.

> NOTE: Asset placeholders in use until final mastered audio variants are delivered; mix levels tuned against average system volume baseline.

## 2025-09-08

### UI Improvements

#### Trading
- **Quick-Add Cash Presets:** In both trade menus, added one-tap buttons to add **+25**, **+50**, and **+100** cash to the offer
  - Presets stack with manual input
  - Works for both giving and requesting cash
  - Buttons disable if the amount would exceed available balance or violate trade constraints

#### Chat
- **Overlay Behavior:** Chat box now opens as a **full overlay** above all game UI when clicked
- **Modern UI:** Redesigned with **chat bubbles** for messages and improved visual design
  - Messages appear as chat bubbles with different colors for sender/receiver
  - Gradient header with modern styling
  - Proper message alignment (sent messages on right, received on left)
- **Click-to-Close:** Clicking anywhere outside the chat box closes it cleanly
- **Enhanced UX:** Larger chat area with better scrolling and input handling

#### Stocks
- **Chart Revamp:** Stock charts redesigned so they render properly:
  - Increased padding to prevent text cutoff
  - No more overlapping text or cut-off data
  - Charts are now clean, properly scaled, and easy to read
  - Responsive design with proper viewBox scaling
  - Improved tick marks and grid lines for better readability

### Critical Bug Fixes

#### Real-time Sync
- **Fixed state desynchronization** where "end turn" wasn't broadcasting/applying to all clients, leaving Roll disabled until a full refresh
- **Enhanced state broadcasting** with multiple delivery mechanisms to ensure all clients receive updates
- **Added periodic state refresh** (every 10 seconds) to combat client desync in active games
- **Improved reconnection handling** with better debugging and room management

#### Recurring Payments
- **Corrected turn-edge timing** so payments execute at the start of the payer's turn, not the end
- **Enhanced bot logic** to handle recurring payments at turn start
- **Added comprehensive logging** for recurring payment processing

#### Technical Improvements
- **Enhanced debugging** with detailed server logs for state broadcasts and turn changes
- **Force synchronization** mechanism for critical state changes (turn transitions)
- **Improved error handling** in state broadcasting
- **Client-side periodic refresh** to ensure state consistency

## 2025-09-07

### Automation Features
- Added Auto Actions with toggle checkmarks:
  - Auto Roll
  - Auto Buy properties
  - Auto End Turn
  - Auto Buy Houses/Hotels
- Configurable minimum balance threshold to keep.
- Optional rules for auto-buying only above/below a specific cost.
- Auto-Spread Houses:
  - New option that distributes house purchases evenly across a color set.
  - Enabled via a checkmark; replaces the normal Buy House behavior when active.

### Board & Layout
- Board container updated to allow subdivision of space:
  - Containers like Current Turn, Players Overview, and Pending Trades can now be placed inside the board to conserve space.
- Player icons reduced by 50%.

### Trades
- Pending trades now update live for both players, no longer delayed until turn end.
- Player selection is now required before the full trading menu opens.
- Pending trade container now shows full player names without truncation.
