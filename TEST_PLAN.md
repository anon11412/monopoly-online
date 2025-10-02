# InvestUp.trade Comprehensive Test Plan

## Test Date: October 1, 2025
## Tester: AI Assistant

## Features to Test

### 1. Authentication & Profile
- [ ] Local account registration
- [ ] Local account login
- [ ] Remember me checkbox
- [ ] Recent accounts panel
- [ ] Quick account selection (Google vs local)
- [ ] Profile view (stats, achievements)
- [ ] Logout and re-login
- [ ] Session persistence across page refresh

### 2. Coin Purchase System
- [ ] View coin balance
- [ ] Purchase coins (Stripe integration)
- [ ] Balance updates across all pages
- [ ] Premium token purchase
- [ ] Premium token ownership display
- [ ] Premium token usage in-game

### 3. Main Menu & Lobby
- [ ] Connect with display name
- [ ] Create new lobby
- [ ] Join existing lobby
- [ ] Rejoin last lobby
- [ ] Auto-refresh lobby list
- [ ] Manual refresh
- [ ] Theme toggle (light/dark)
- [ ] Audio settings
- [ ] Accessibility settings

### 4. Core Gameplay
- [ ] Roll dice
- [ ] Move player token
- [ ] Buy property from bank
- [ ] Pay rent to property owner
- [ ] Land on special spaces (GO, Jail, Free Parking, etc.)
- [ ] Draw Chance/Community Chest cards
- [ ] Pass GO (collect $200)
- [ ] Go to Jail

### 5. Property Management
- [ ] View owned properties
- [ ] Build houses (evenly across color group)
- [ ] Build hotels (after 4 houses)
- [ ] Sell houses/hotels
- [ ] Mortgage properties
- [ ] Unmortgage properties
- [ ] View property details & rent calculation

### 6. Trading System (Traditional)
- [ ] Create trade offer
- [ ] Offer cash
- [ ] Offer properties
- [ ] Request cash
- [ ] Request properties
- [ ] Accept trade
- [ ] Reject trade
- [ ] Withdraw trade
- [ ] View pending trades

### 7. Advanced Trading (Per-Turn Payments)
- [ ] Add per-turn payment (you pay)
- [ ] Add per-turn payment (partner pays)
- [ ] Configure payment amount
- [ ] Configure payment duration (turns)
- [ ] Multiple payments in one trade
- [ ] Payment execution over turns
- [ ] View active payment obligations

### 8. Player Stock Market
- [ ] Buy shares in other players
- [ ] Calculate ownership percentage
- [ ] View stock portfolio
- [ ] Sell shares
- [ ] Stock value updates based on player cash
- [ ] Profit/loss calculation

### 9. Automation Features
- [ ] Auto-roll dice
- [ ] Auto-buy unowned properties
- [ ] Auto-end turn
- [ ] Auto-mortgage (when cash low)
- [ ] Auto-unmortgage (when cash available)
- [ ] Configure automation settings

### 10. Dashboard & Analytics
- [ ] View game stats
- [ ] Property value chart
- [ ] Rent collected chart
- [ ] Net worth over time
- [ ] Trade history
- [ ] Achievement tracking

### 11. Friends System
- [ ] View friends list
- [ ] Send friend request
- [ ] Accept friend request
- [ ] Reject friend request
- [ ] View pending requests

### 12. Multiplayer Features
- [ ] Multiple players in same lobby
- [ ] Real-time updates via Socket.IO
- [ ] Turn order enforcement
- [ ] Player elimination (bankruptcy)
- [ ] Win condition (last player standing)
- [ ] Spectator mode

### 13. UI/UX
- [ ] Responsive design (resize window)
- [ ] Mobile-friendly layout
- [ ] Keyboard shortcuts
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Font size adjustment
- [ ] Interactive demos (property, trade)

### 14. Error Handling
- [ ] Invalid trade rejection
- [ ] Insufficient funds handling
- [ ] Network disconnection recovery
- [ ] Session timeout
- [ ] Invalid action prevention
- [ ] Helpful error messages

## Test Results

### Session 1 - Initial Setup
- Backend: ✅ Running at http://127.0.0.1:8000
- Frontend: ✅ Running at http://127.0.0.1:5173
- Health check: ✅ {"ok":true}

### Session 2 - Testing in Progress...
