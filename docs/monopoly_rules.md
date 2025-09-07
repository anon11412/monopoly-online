# Monopoly (Classic US) — Practical Rules Reference

This document summarizes the standard Monopoly rules in concise, implementable terms to guide our web version. It focuses on canonical mechanics: movement, ownership, rents, taxes, cards, jail, houses/hotels, mortgages, trading, and bankruptcy.

Note: This is a neutral summary written in our own words based on general knowledge of the classic rules; use it to fill gameplay gaps and validate UI/UX. House rules are excluded unless stated.

## Board and Setup
- 40 spaces around the edge. GO is the start corner.
- Starting cash: $1500 per player (2–8 players). Suggested denominations: 2x $500, 2x $100, 2x $50, 6x $20, 5x each of $10/$5/$1.
- Property groups and prices (already reflected in board metadata):
  - Brown: Mediterranean $60, Baltic $60
  - Light Blue: Oriental $100, Vermont $100, Connecticut $120
  - Pink: St. Charles $140, States $140, Virginia $160
  - Orange: St. James $180, Tennessee $180, New York $200
  - Red: Kentucky $220, Indiana $220, Illinois $240
  - Yellow: Atlantic $260, Ventnor $260, Marvin Gardens $280
  - Green: Pacific $300, North Carolina $300, Pennsylvania $320
  - Dark Blue: Park Place $350, Boardwalk $400
  - Railroads: Reading, Pennsylvania, B. & O., Short Line — each $200
  - Utilities: Electric Company, Water Works — each $150
- Special spaces: Community Chest (3), Chance (3), Taxes (Income Tax, Luxury Tax), Free Parking, Jail/Just Visiting, Go To Jail.

## Turn Flow
1. Roll two dice.
2. Move forward the total. If you pass GO, collect $200 (exact landing on GO also collects $200).
3. Resolve the landing space:
   - Unowned purchasable space (property/railroad/utility): may buy for list price. If declined, it goes to auction (optional feature; can be added later).
   - Owned by another: pay rent (see Rents) unless mortgaged or owner is in bankruptcy resolution.
   - Owned by you: nothing, unless managing houses/hotel.
   - Chance/Chest: draw top card and resolve. Place card on bottom unless it is “Get Out of Jail Free,” which can be kept.
   - Taxes: pay the specified amount ($200 Income Tax or 10% cash+assets — we’ll use $200 flat for now; Luxury Tax $100 in classic; older prints $75).
   - Go To Jail: move token to Jail (do not collect $200 for passing GO), set in_jail = true.
4. If rolled doubles: you may roll again. Three consecutive doubles sends you to Jail immediately (do not move by third roll result).
5. End turn or perform allowed actions (trade, mortgage, buy/sell houses/hotel within rules) before ending.

## Jail
- Entering: via Go To Jail or drawing a card, or three consecutive doubles.
- On your turn in jail, choose one:
  - Pay $50 before rolling, then roll and move as normal; or
  - Use a Get Out of Jail Free card; or
  - Attempt to roll doubles. If doubles, move out by the roll and end in the destination; if not, remain. After three failed attempts, you must pay $50 and then move by the third roll.
- While in jail, you can collect rent on owned properties, and you can trade/mortgage/build as normal.

## Ownership and Rents
- Buying grants title; track owner per position. Mortgaged properties do not collect rent and show a mortgage marker.
- Base rents are fixed per property and increase with houses/hotel. Railroads and utilities have special rent rules:
  - Railroads: rent = $25 × number of railroads owned by that owner (1:25, 2:50, 3:100, 4:200). If mortgaged, no rent.
  - Utilities: if one utility owned, rent = 4 × dice roll; if both owned, rent = 10 × dice roll. If mortgaged, no rent. Rent is only known on the roll that lands you there; otherwise use last roll.
- Monopolies: Owning all properties in a color group doubles base rent for unimproved properties (no houses/hotel).
- Building: You can buy houses only if you own all properties in that color group and none are mortgaged. Build evenly: difference in house count among properties in a group cannot exceed 1. Four houses may be upgraded to a hotel (returning all four houses to bank and buying one hotel). Selling houses follows even rule in reverse. Hotels sell back to bank as 4 houses equivalent.

## Houses/Hotels Costs and Rents (classic set)
- Costs per house/hotel by color:
  - Brown, Light Blue: $50 per house; hotel costs 4 houses + $50.
  - Pink, Orange: $100 per house; hotel 4 houses + $100.
  - Red, Yellow: $150 per house; hotel 4 houses + $150.
  - Green: $200 per house; hotel 4 houses + $200.
  - Dark Blue: $200 per house; hotel 4 houses + $200.
- Rents per property escalate by houses/hotel per official chart. We’ll add a rent table JSON later for implementation.

## Mortgages
- You may mortgage an unimproved property for its mortgage value (typically half purchase price; exact chart varies per property). Pay 10% interest when lifting the mortgage (i.e., unmortgage cost = mortgage value + 10%). No rent is collected while mortgaged. Color-group building is blocked if any property in the group is mortgaged.

## Chance and Community Chest
- Standard 16 cards each. Effects include moves (Advance to GO, Illinois Ave., St. Charles Place, nearest Railroad/Utility), payments/collections, Get Out of Jail Free, street repairs (pay per house/hotel), and Go To Jail.
- For MVP: implement a subset covering movement to named tiles, jail logic, and simple payments/collections; add the rest incrementally.

## Trading
- Players can trade cash, properties, and Get Out of Jail Free cards at any time, provided it’s your turn or based on house rules. Our UI supports cash + properties and optionally the jail card.

## Bankruptcy
- If you owe more than you can pay to a creditor, you may liquidate by selling houses (half price), mortgaging, and trading. If still insolvent:
  - If debt to another player: transfer all assets of value to that player (properties, Get Out of Jail Free). Mortgaged properties transfer with mortgage; receiver must pay 10% interest immediately or on unmortgaging per official variants.
  - If debt to bank: return properties to bank (they are immediately auctioned by the bank per official rules; we may implement later). Remove player token.

## Auctions (Optional Feature)
- When a player declines to buy an unowned property on which they landed, it must be auctioned by the bank. Any player (including the decliner) may bid. We can add a simple ascending-bid UI later.

## Implementation Notes for Our App
- Server already exposes tile names/types/prices at /board_meta and can sell unowned properties.
- Needed next steps:
  1) Rent calculation and payments on landings (properties, railroads, utilities; monopoly/unimproved double rule).
  2) Taxes (Income Tax at $200 flat; Luxury Tax $100) until we add 10% option.
  3) Jail state and turn options (pay/use card/roll doubles; three doubles to jail).
  4) Chance/Chest minimal deck with location moves and basic payments; persistent Get Out of Jail card state.
  5) Building rules and costs; mortgage/unmortgage rules and interest; even-building enforcement.
  6) Auctions for declined purchases (optional phase two).
- Data additions: rents table per property, house/hotel costs per color group, mortgage values per title deed, and card decks content.

---
This document is a developer aid; it’s not a verbatim reproduction of any manual and avoids proprietary images or text.
