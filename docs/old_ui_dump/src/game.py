"""
Main Monopoly Game Controller
"""

import random
import tkinter as tk
from tkinter import messagebox, simpledialog
from gui import MonopolyGUI
from player import Player, AIBot
from board import BOARD_PROPERTIES, get_property_by_position, SpecialSpace
from cards import CardDeck, execute_card_action
from simple_function_blocks import SimpleFunctionBlocksSystem
from function_blocks_executor import FunctionBlockExecutor

class MonopolyGame:
    def __init__(self):
        self.players = []
        self.current_player_index = 0
        self.game_over = False
        self.dice_rolled = False
        self.last_dice_roll = (0, 0)
        self.chance_deck = CardDeck('chance')
        self.community_chest_deck = CardDeck('community_chest')
        # Pending trades system
        self.pending_trades = []  # List of trade proposals waiting for approval
        # NEW SUPER SIMPLE FUNCTION BLOCKS SYSTEM
        self.simple_blocks = SimpleFunctionBlocksSystem(self)
        # COMBINED TRADING FUNCTION BLOCKS EXECUTOR
        self.function_blocks_executor = FunctionBlockExecutor(self)
        # GUI will be initialized after setup
        self.gui = None
        # Vote-kick system state
        self.vote_kick = None  # {'target': Player, 'voters': set(Player), 'required': int, 'expires_at': epoch}
        
    def setup_game(self):
        """Setup game with player selection"""
        # For now, create a default game setup
        # Later this can be expanded with a setup dialog
        
        # Create players
        self.players = [
            Player("Player 1", is_bot=False),
            AIBot("Bot Alice", "aggressive"),
            AIBot("Bot Bob", "conservative"),
            AIBot("Bot Charlie", "monopoly_hunter")
        ]
        
        # Initialize GUI
        self.gui = MonopolyGUI(self)
        self.update_display()
        
    def run(self):
        """Start the game"""
        self.setup_game()
        self.gui.add_log_message("Welcome to Monopoly!")
        self.gui.add_log_message(f"{self.get_current_player().name}'s turn")
        self.gui.run()
    
    def get_current_player(self):
        """Get the current player"""
        return self.players[self.current_player_index]
    
    def roll_dice(self):
        """Roll dice and move current player"""
        if self.dice_rolled:
            self.gui.add_log_message("You have already rolled this turn!")
            return
        
        current_player = self.get_current_player()
        
        # Roll dice
        dice1 = random.randint(1, 6)
        dice2 = random.randint(1, 6)
        total = dice1 + dice2
        self.last_dice_roll = (dice1, dice2)
        
        self.gui.update_dice_display(dice1, dice2)
        self.gui.add_log_message(f"{current_player.name} rolled {dice1} + {dice2} = {total}")
        
        # Execute function blocks triggered by dice roll
        self.execute_function_blocks_on_event("dice_roll", player=current_player, dice_total=total, 
                                            dice1=dice1, dice2=dice2)
        
        # Handle jail
        if current_player.in_jail:
            self.handle_jail_turn(dice1, dice2, total)
            return
        
        # Move player
        passed_go = current_player.move(total)
        if passed_go:
            self.gui.add_log_message(f"{current_player.name} passed GO and collected $200!")
        
        # Handle landing on space
        self.handle_space_landing(current_player)
        
        self.dice_rolled = True
        
        # Check for doubles
        if dice1 == dice2 and not current_player.in_jail:
            self.gui.add_log_message("Doubles! You get another turn!")
            self.dice_rolled = False
        
        self.update_display()
        
        # Disabled auto-play for manual testing - comment out these lines to re-enable
        # Auto-play for bots
        # if current_player.is_bot and not self.dice_rolled:
        #     self.gui.root.after(1000, self.roll_dice)  # Roll again after 1 second
    
    def handle_jail_turn(self, dice1, dice2, total):
        """Handle player turn while in jail"""
        current_player = self.get_current_player()
        
        if dice1 == dice2:
            # Rolled doubles - get out of jail
            current_player.in_jail = False
            current_player.jail_turns = 0
            passed_go = current_player.move(total)
            if passed_go:
                self.gui.add_log_message(f"{current_player.name} passed GO and collected $200!")
            self.gui.add_log_message(f"{current_player.name} rolled doubles and got out of jail!")
            self.handle_space_landing(current_player)
        else:
            current_player.jail_turns += 1
            if current_player.jail_turns >= 3:
                # Must pay fine after 3 turns
                current_player.money -= 50
                current_player.in_jail = False
                current_player.jail_turns = 0
                passed_go = current_player.move(total)
                if passed_go:
                    self.gui.add_log_message(f"{current_player.name} passed GO and collected $200!")
                self.gui.add_log_message(f"{current_player.name} paid $50 fine and got out of jail!")
                self.handle_space_landing(current_player)
            else:
                self.gui.add_log_message(f"{current_player.name} stays in jail (turn {current_player.jail_turns}/3)")
        
        self.dice_rolled = True
    
    def handle_space_landing(self, player):
        """Handle player landing on a space"""
        space = get_property_by_position(player.position)
        
        # Execute function blocks triggered by property landing
        self.execute_function_blocks_on_event("property_land", player=player, property=space)
        
        if isinstance(space, SpecialSpace):
            self.handle_special_space(player, space)
        elif hasattr(space, 'owner'):
            self.handle_property_space(player, space)
    
    def handle_special_space(self, player, space):
        """Handle landing on special spaces"""
        if space.space_type == "go":
            # Already handled in movement
            pass
        elif space.space_type == "jail":
            self.gui.add_log_message(f"{player.name} is just visiting jail")
        elif space.space_type == "free_parking":
            self.gui.add_log_message(f"{player.name} rests at Free Parking")
        elif space.space_type == "go_to_jail":
            player.position = 10
            player.in_jail = True
            player.jail_turns = 0
            self.gui.add_log_message(f"{player.name} goes to jail!")
        elif space.space_type == "tax":
            if "Income" in space.name:
                tax_amount = 200
            else:  # Luxury Tax
                tax_amount = 75
            player.money -= tax_amount
            self.gui.add_log_message(f"{player.name} paid ${tax_amount} in taxes")
        elif space.space_type == "chance":
            card = self.chance_deck.draw_card()
            result = execute_card_action(card, player, self.players, BOARD_PROPERTIES)
            self.gui.add_log_message(f"Chance: {result['message']}")
            if result['passed_go']:
                self.gui.add_log_message(f"{player.name} passed GO and collected $200!")
        elif space.space_type == "community_chest":
            card = self.community_chest_deck.draw_card()
            result = execute_card_action(card, player, self.players, BOARD_PROPERTIES)
            self.gui.add_log_message(f"Community Chest: {result['message']}")
            if result['passed_go']:
                self.gui.add_log_message(f"{player.name} passed GO and collected $200!")
    
    def handle_property_space(self, player, property_obj):
        """Handle landing on a property"""
        if property_obj.owner is None:
            # Property is available for purchase
            self.gui.add_log_message(f"{property_obj.name} is available for ${property_obj.price}")
            # Removed auto-buy for bots - now all players are manual
            # if player.is_bot:
            #     if player.should_buy_property(property_obj):
            #         self.buy_property(player, property_obj)
            #     else:
            #         self.gui.add_log_message(f"{player.name} chose not to buy {property_obj.name}")
            # else:
            #     self.gui.add_log_message(f"{property_obj.name} is available for ${property_obj.price}")
        elif property_obj.owner != player:
            # Pay rent
            rent = property_obj.get_rent()
            if rent > 0:
                success = player.pay_rent(rent, property_obj.owner)
                if success:
                    self.gui.add_log_message(f"{player.name} paid ${rent} rent to {property_obj.owner.name}")
                    # Execute function blocks triggered by rent payment
                    self.execute_function_blocks_on_event("rent_pay", payer=player, receiver=property_obj.owner, 
                                                        amount=rent, property=property_obj)
                else:
                    self.gui.add_log_message(f"{player.name} couldn't afford rent and went bankrupt!")
                    self.remove_player_from_game(player, property_obj.owner)
        else:
            self.gui.add_log_message(f"{player.name} landed on their own property")
    
    def buy_property(self, player, property_obj):
        """Handle property purchase"""
        if player.buy_property(property_obj):
            self.gui.add_log_message(f"{player.name} bought {property_obj.name} for ${property_obj.price}")
            return True
        else:
            self.gui.add_log_message(f"{player.name} can't afford {property_obj.name}")
            return False
    
    def buy_current_property(self):
        """Buy property button handler"""
        current_player = self.get_current_player()
        # Removed bot restriction - now all players can be controlled manually
        # if current_player.is_bot:
        #     self.gui.add_log_message("AI players make their own decisions!")
        #     return
        
        space = get_property_by_position(current_player.position)
        if hasattr(space, 'owner') and space.owner is None:
            self.buy_property(current_player, space)
        else:
            self.gui.add_log_message("No property available for purchase here!")
        
        self.update_display()
    
    def handle_bankruptcy(self, bankrupt_player, creditor):
        """Legacy: delegate to remove_player_from_game after transferring assets to creditor."""
        self.gui.add_log_message(f"{bankrupt_player.name} couldn't afford payment and went bankrupt!")
        self.remove_player_from_game(bankrupt_player, creditor)

    def remove_player_from_game(self, player, creditor=None):
        """Remove a bankrupt player entirely from the game.

        - Transfers assets appropriately (to creditor if provided, else back to bank)
        - Removes player from turn order and selections
        - Purges any active function-block or simple-block payments involving them
        - Removes pending trades involving them
        - Adjusts current_player_index safely
        - Ends game if 1 or 0 players remain
        """
        if not player:
            return
        
        # Transfer assets
        if creditor is not None and creditor is not player:
            # Transfer all properties to creditor
            for prop in list(player.properties):
                prop.owner = creditor
                if prop not in creditor.properties:
                    creditor.properties.append(prop)
                if prop in player.properties:
                    player.properties.remove(prop)
            # Transfer remaining positive cash
            if player.money > 0:
                creditor.money += player.money
        else:
            # Return properties to bank (unowned)
            for prop in list(player.properties):
                prop.owner = None
                if prop in player.properties:
                    player.properties.remove(prop)
        
        # Zero out player and flag
        player.money = 0
        player.bankrupt = True

        # Purge any active payments/blocks involving this player
        try:
            if hasattr(self, 'simple_blocks') and self.simple_blocks:
                self.simple_blocks.purge_player(player)
        except Exception:
            pass
        try:
            if hasattr(self, 'function_blocks_executor') and self.function_blocks_executor:
                self.function_blocks_executor.purge_player(player)
        except Exception:
            pass

        # Remove any pending trades involving this player
        if hasattr(self, 'pending_trades') and self.pending_trades:
            self.pending_trades = [t for t in self.pending_trades if t.proposer != player and t.recipient != player]

        # Determine index before removal
        removed_index = None
        try:
            removed_index = self.players.index(player)
        except ValueError:
            removed_index = None

        # Remove player from players list
        if removed_index is not None:
            self.players.pop(removed_index)

        # Adjust current_player_index
        if removed_index is not None:
            if removed_index < self.current_player_index:
                # Shift left since list contracted before current index
                self.current_player_index -= 1
            elif removed_index == self.current_player_index:
                # If current player removed, keep index at same position which now points to next player
                # unless no players remain
                if not self.players:
                    self.current_player_index = 0
                else:
                    self.current_player_index = self.current_player_index % len(self.players)

        # Log and UI update
        self.gui.add_log_message(f"{player.name} has been removed from the game (bankrupt)")
        
        # End game if 1 or fewer players remain
        if len(self.players) <= 1:
            winner = self.players[0] if self.players else None
            self.end_game(winner)
            return

        # Refresh display
        self.update_display()
    
    def end_turn(self):
        """End current player's turn"""
        if not self.dice_rolled:
            self.gui.add_log_message("You must roll dice first!")
            return
        
        self.dice_rolled = False
        
        # Move to next player
        self.current_player_index = (self.current_player_index + 1) % len(self.players)
        
        # Skip bankrupt players
        while self.players[self.current_player_index].bankrupt:
            self.current_player_index = (self.current_player_index + 1) % len(self.players)
        
        # Reset any active vote-kick when dice holder changes
        self.reset_vote_kick()
        
        next_player = self.get_current_player()
        
        # 🚀 SUPER SIMPLE FUNCTION BLOCKS EXECUTION
        self.simple_blocks.execute_payments_for_player(next_player)
        
        # 🔧 COMBINED TRADING FUNCTION BLOCKS EXECUTION
        self.function_blocks_executor.execute_blocks_for_player(next_player)
        
        self.gui.add_log_message(f"{next_player.name}'s turn")
        
        self.update_display()
        
        # Disabled auto-play for manual testing - comment out these lines to re-enable
        # Auto-play for bots
        # if next_player.is_bot:
        #     self.gui.root.after(1500, self.bot_turn)

    # ================= Vote-kick system =================
    def _vote_required_count(self, target):
        """Votes required equals all other active players minus one (all but one of others)."""
        others = [p for p in self.players if p != target and not p.bankrupt]
        return max(1, max(0, len(others) - 1))

    def reset_vote_kick(self):
        """Clear any active vote-kick state and update UI."""
        self.vote_kick = None
        try:
            if self.gui:
                self.gui.update_vote_kick_display()
        except Exception:
            pass

    def _schedule_vote_tick(self):
        if not self.gui:
            return
        def tick():
            if not self.vote_kick:
                return
            import time as _t
            if _t.time() >= self.vote_kick.get('expires_at', 0):
                target = self.vote_kick.get('target')
                # Only kick if target still holds dice
                if target == self.get_current_player() and target in self.players:
                    self.gui.add_log_message(f"Vote-kick timer expired. {target.name} is removed from the game.")
                    self.remove_player_from_game(target)
                self.reset_vote_kick()
                return
            try:
                self.gui.update_vote_kick_display()
            except Exception:
                pass
            # Continue ticking
            self.gui.root.after(1000, tick)
        # Start ticking loop
        self.gui.root.after(1000, tick)

    def cast_vote_kick(self, voter):
        """Cast a vote to kick the current dice holder. Starts timer on first vote, shortens on second."""
        import time
        target = self.get_current_player()
        if not target or voter == target or voter.bankrupt:
            return
        # Initialize or reset if target changed
        if not self.vote_kick or self.vote_kick.get('target') != target:
            self.vote_kick = {
                'target': target,
                'voters': set(),
                'required': self._vote_required_count(target),
                'expires_at': time.time() + 5 * 60,  # 5 minutes
            }
            self.gui.add_log_message(f"Vote-kick started against {target.name}. Timer: 5:00")
            self._schedule_vote_tick()
        # Record vote
        self.vote_kick['voters'].add(voter)
        # If second vote and more than 2 minutes remain, reduce to 2 minutes
        remaining = self.vote_kick['expires_at'] - time.time()
        if len(self.vote_kick['voters']) == 2 and remaining > 120:
            self.vote_kick['expires_at'] = time.time() + 120
            self.gui.add_log_message("Second vote cast; vote-kick timer reduced to 2:00")
        # If threshold reached, kick immediately
        if len(self.vote_kick['voters']) >= self.vote_kick['required']:
            self.gui.add_log_message(f"Vote-kick passed. {target.name} is removed from the game.")
            self.remove_player_from_game(target)
            self.reset_vote_kick()
            return
        # Update UI
        try:
            self.gui.update_vote_kick_display()
        except Exception:
            pass
    
    def bot_turn(self):
        """Handle bot turn automatically"""
        current_player = self.get_current_player()
        if current_player.is_bot and not self.dice_rolled:
            self.roll_dice()
            
            # End turn after a delay
            if self.dice_rolled:
                self.gui.root.after(2000, self.end_turn)
    
    def update_display(self):
        """Update all GUI elements"""
        self.gui.update_player_display(self.players, self.current_player_index)
        # Redraw board to refresh ownership indicators
        try:
            self.gui.redraw_board()
        except Exception:
            pass
        self.gui.update_player_positions(self.players)
        self.gui.update_action_buttons()  # Update button states
    
    def end_game(self, winner):
        """End the game"""
        self.game_over = True
        if winner:
            message = f"Game Over! {winner.name} wins with ${winner.get_net_worth()} net worth!"
        else:
            message = "Game Over! No winner."
        
        self.gui.add_log_message(message)
        messagebox.showinfo("Game Over", message)
    
    def add_pending_trade(self, trade):
        """Add a trade to the pending trades queue"""
        self.pending_trades.append(trade)
        self.gui.add_log_message(f"New trade proposal from {trade.proposer.name} to {trade.recipient.name}")
    
    def get_pending_trades_for_player(self, player):
        """Get all pending trades where the player is the recipient"""
        return [trade for trade in self.pending_trades if trade.recipient == player]
    
    def get_all_pending_trades(self):
        """Get all pending trades"""
        return self.pending_trades.copy()
    
    def remove_pending_trade(self, trade):
        """Remove a trade from the pending trades queue"""
        if trade in self.pending_trades:
            self.pending_trades.remove(trade)
    
    # Function Block Execution System
    def execute_function_blocks_on_event(self, event_type, **kwargs):
        """Execute function blocks that are triggered by game events"""
        # Check all accepted trades for function blocks that should trigger
        if not hasattr(self, 'accepted_trades'):
            self.accepted_trades = []
            
        for trade in self.accepted_trades:
            if trade.has_function_blocks():
                # Execute proposer's blocks
                self.execute_trade_chain(trade.proposer_function_blocks, trade.proposer_block_variables, 
                                       trade.proposer, trade.recipient, event_type, **kwargs)
                # Execute recipient's blocks
                self.execute_trade_chain(trade.recipient_function_blocks, trade.recipient_block_variables,
                                       trade.recipient, trade.proposer, event_type, **kwargs)
    
    def execute_trade_chain(self, function_blocks, block_variables, owner, partner, event_type, **kwargs):
        """Execute a chain of function blocks for a specific player"""
        for block in function_blocks:
            if self.should_execute_block(block, block_variables, event_type, **kwargs):
                self.execute_block(block, block_variables, owner, partner, **kwargs)
    
    def should_execute_block(self, block, block_variables, event_type, **kwargs):
        """Determine if a block should execute based on current event and conditions"""
        block_name = block['name']
        variables = block_variables.get(block['id'], {})
        
        # Timing blocks - determine when to execute
        if block_name == "On Turn Start":
            return event_type == "turn_start" and kwargs.get('player') in [self.get_current_player()]
        elif block_name == "On Property Land":
            return event_type == "property_land" and kwargs.get('player') and kwargs.get('property')
        elif block_name == "On Rent Pay":
            return event_type == "rent_pay" and kwargs.get('payer') and kwargs.get('receiver')
        elif block_name == "After Dice":
            return event_type == "dice_roll" and kwargs.get('dice_total')
        
        # Condition blocks - check if conditions are met
        elif block_name == "If Has Property":
            property_name = variables.get('property_name', '')
            player = kwargs.get('player', self.get_current_player())
            return any(prop.name == property_name for prop in player.properties)
        elif block_name == "If Money >":
            amount = int(variables.get('amount', 0))
            player = kwargs.get('player', self.get_current_player())
            return player.money > amount
        elif block_name == "If Dice =":
            target_roll = int(variables.get('dice_value', 0))
            return kwargs.get('dice_total') == target_roll
        elif block_name == "If Turn =":
            target_turn = int(variables.get('turn_number', 0))
            return kwargs.get('turn_number') == target_turn
        
        # Action blocks always execute if reached
        elif block_name in ["Transfer Property", "Pay Money", "Move To", "Collect Rent"]:
            return True
            
        # Logic blocks
        elif block_name == "AND":
            # Check if all previous conditions in chain were true
            return kwargs.get('previous_result', True)
        elif block_name == "OR":
            # Check if any previous condition was true (simplified logic)
            return True  # More complex logic would track multiple conditions
        elif block_name == "NOT":
            return not kwargs.get('previous_result', False)
        
        return False
    
    def execute_block(self, block, block_variables, owner, partner, **kwargs):
        """Execute a specific function block"""
        block_name = block['name']
        variables = block_variables.get(block['id'], {})
        
        try:
            if block_name == "Transfer Property":
                property_name = variables.get('property_name', '')
                # Find property and transfer it
                property_to_transfer = None
                for prop in owner.properties:
                    if prop.name == property_name:
                        property_to_transfer = prop
                        break
                
                if property_to_transfer:
                    owner.properties.remove(property_to_transfer)
                    partner.properties.append(property_to_transfer)
                    property_to_transfer.owner = partner
                    self.gui.add_log_message(f"Function Block: {property_name} transferred from {owner.name} to {partner.name}")
            
            elif block_name == "Pay Money":
                amount = int(variables.get('amount', 0))
                if owner.money >= amount:
                    owner.money -= amount
                    partner.money += amount
                    self.gui.add_log_message(f"Function Block: {owner.name} paid ${amount} to {partner.name}")
            
            elif block_name == "Move To":
                position = int(variables.get('position', 0))
                old_position = owner.position
                owner.position = position
                # Check if passed GO
                if position < old_position:
                    owner.money += 200
                    self.gui.add_log_message(f"Function Block: {owner.name} moved to position {position} and passed GO!")
                else:
                    self.gui.add_log_message(f"Function Block: {owner.name} moved to position {position}")
                self.handle_space_landing(owner)
            
            elif block_name == "Collect Rent":
                property_name = variables.get('property_name', '')
                # Find property and collect rent from all players on it
                target_property = None
                for prop in owner.properties:
                    if prop.name == property_name:
                        target_property = prop
                        break
                
                if target_property:
                    for player in self.players:
                        if player != owner and player.position == target_property.position:
                            rent = target_property.rent
                            if player.money >= rent:
                                player.money -= rent
                                owner.money += rent
                                self.gui.add_log_message(f"Function Block: {player.name} paid ${rent} rent to {owner.name} for {property_name}")
            
            # Value blocks (used in other blocks)
            elif block_name == "Property Count":
                return len(owner.properties)
            elif block_name == "Money Amount":
                return owner.money
            elif block_name == "Dice Roll":
                return kwargs.get('dice_total', 0)
            elif block_name == "Turn Number":
                return kwargs.get('turn_number', 0)
                
        except Exception as e:
            self.gui.add_log_message(f"Function Block Error: {block_name} failed to execute: {str(e)}")
    
    def accept_trade(self, trade):
        """Accept a trade and execute it"""
        # Check if this is a super simple enhanced trade
        if hasattr(trade, 'has_function_blocks') and trade.has_function_blocks():
            self.accept_super_simple_trade(trade)
        # Check if this is a combined trading enhanced trade
        elif hasattr(trade, 'function_blocks') and trade.function_blocks:
            self.accept_combined_trading_trade(trade)
        else:
            # Execute traditional trade
            self.execute_traditional_trade(trade)
        
        # Remove from pending
        self.remove_pending_trade(trade)
        
        self.gui.add_log_message(f"Trade accepted between {trade.proposer.name} and {trade.recipient.name}")
    
    def accept_combined_trading_trade(self, trade):
        """Accept a combined trading enhanced trade with function blocks"""
        # First execute traditional parts
        self.execute_traditional_trade(trade)
        
        # Then process function blocks
        self.function_blocks_executor.add_function_blocks_from_trade(trade)
        
        self.gui.add_log_message(f"🚀 Combined Trading Enhanced trade completed!")
        
        # Show active function blocks
        summary = self.function_blocks_executor.get_active_blocks_summary()
        if "No active" not in summary:
            self.gui.add_log_message(f"📋 {summary}")
    
    def accept_super_simple_trade(self, trade):
        """Accept a super simple enhanced trade"""
        # First execute traditional parts
        self.execute_traditional_trade(trade)
        
        # Then setup function blocks using the super simple system
        if hasattr(trade, 'my_blocks') and trade.my_blocks:
            # Proposer's payments (they pay recipient)
            for block_data in trade.my_blocks:
                self.simple_blocks.create_payment_from_blocks(
                    [{'id': 'pay_money', 'value': block_data['amount']},
                     {'id': 'for_turns', 'value': block_data['turns']}],
                    trade.proposer, trade.recipient
                )
        
        if hasattr(trade, 'partner_blocks') and trade.partner_blocks:
            # Recipient's payments (they pay proposer)
            for block_data in trade.partner_blocks:
                self.simple_blocks.create_payment_from_blocks(
                    [{'id': 'pay_money', 'value': block_data['amount']},
                     {'id': 'for_turns', 'value': block_data['turns']}],
                    trade.recipient, trade.proposer
                )
        
        self.gui.add_log_message(f"🚀 Super Simple Enhanced trade completed!")
        
        # Show active payments
        summary = self.simple_blocks.get_active_payments_summary()
        if "No active" not in summary:
            self.gui.add_log_message(f"📋 {summary}")
    
    def execute_traditional_trade(self, trade):
        """Execute the traditional property/money exchange"""
        # Transfer properties from proposer to recipient
        for prop in trade.offered_properties:
            trade.proposer.properties.remove(prop)
            trade.recipient.properties.append(prop)
            prop.owner = trade.recipient
        
        # Transfer properties from recipient to proposer
        for prop in trade.requested_properties:
            trade.recipient.properties.remove(prop)
            trade.proposer.properties.append(prop)
            prop.owner = trade.proposer
        
        # Transfer money
        if trade.offered_money > 0:
            trade.proposer.money -= trade.offered_money
            trade.recipient.money += trade.offered_money
        
        if trade.requested_money > 0:
            trade.recipient.money -= trade.requested_money
            trade.proposer.money += trade.requested_money

if __name__ == "__main__":
    game = MonopolyGame()
    game.run()
