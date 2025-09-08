# Changelog

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
