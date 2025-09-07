"""
Save and Load functionality for Monopoly game
"""

import json
import os
from tkinter import filedialog, messagebox

def save_game(game_instance, filename=None):
    """Save the current game state"""
    if filename is None:
        filename = filedialog.asksaveasfilename(
            defaultextension=".json",
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            title="Save Monopoly Game"
        )
    
    if not filename:
        return False
    
    try:
        game_data = {
            "players": [],
            "current_player_index": game_instance.current_player_index,
            "dice_rolled": game_instance.dice_rolled,
            "last_dice_roll": game_instance.last_dice_roll,
            "properties": []
        }
        
        # Save player data
        for player in game_instance.players:
            player_data = {
                "name": player.name,
                "money": player.money,
                "position": player.position,
                "is_bot": player.is_bot,
                "in_jail": player.in_jail,
                "jail_turns": player.jail_turns,
                "get_out_of_jail_cards": player.get_out_of_jail_cards,
                "bankrupt": player.bankrupt,
                "properties": [prop.name for prop in player.properties]
            }
            
            if player.is_bot:
                player_data["bot_personality"] = player.bot_personality
            
            game_data["players"].append(player_data)
        
        # Save property states
        from board import BOARD_PROPERTIES
        for space in BOARD_PROPERTIES:
            if hasattr(space, 'owner'):
                prop_data = {
                    "name": space.name,
                    "owner": space.owner.name if space.owner else None,
                    "houses": getattr(space, 'houses', 0),
                    "hotel": getattr(space, 'hotel', False),
                    "mortgaged": getattr(space, 'mortgaged', False)
                }
                game_data["properties"].append(prop_data)
        
        with open(filename, 'w') as f:
            json.dump(game_data, f, indent=2)
        
        messagebox.showinfo("Save Successful", f"Game saved to {filename}")
        return True
    
    except Exception as e:
        messagebox.showerror("Save Error", f"Failed to save game: {str(e)}")
        return False

def load_game(game_instance, filename=None):
    """Load a saved game state"""
    if filename is None:
        filename = filedialog.askopenfilename(
            filetypes=[("JSON files", "*.json"), ("All files", "*.*")],
            title="Load Monopoly Game"
        )
    
    if not filename or not os.path.exists(filename):
        return False
    
    try:
        with open(filename, 'r') as f:
            game_data = json.load(f)
        
        # Clear current game
        game_instance.players = []
        
        # Restore players
        from player import Player, AIBot
        for player_data in game_data["players"]:
            if player_data["is_bot"]:
                player = AIBot(player_data["name"], player_data.get("bot_personality", "balanced"))
            else:
                player = Player(player_data["name"])
            
            player.money = player_data["money"]
            player.position = player_data["position"]
            player.in_jail = player_data["in_jail"]
            player.jail_turns = player_data["jail_turns"]
            player.get_out_of_jail_cards = player_data["get_out_of_jail_cards"]
            player.bankrupt = player_data["bankrupt"]
            
            game_instance.players.append(player)
        
        # Restore property ownership
        from board import BOARD_PROPERTIES, get_property_by_name
        
        # Reset all properties
        for space in BOARD_PROPERTIES:
            if hasattr(space, 'owner'):
                space.owner = None
                space.houses = 0
                space.hotel = False
                space.mortgaged = False
        
        # Restore property states
        for prop_data in game_data["properties"]:
            prop = get_property_by_name(prop_data["name"])
            if prop:
                if prop_data["owner"]:
                    owner = next((p for p in game_instance.players if p.name == prop_data["owner"]), None)
                    if owner:
                        prop.owner = owner
                        owner.properties.append(prop)
                
                prop.houses = prop_data.get("houses", 0)
                prop.hotel = prop_data.get("hotel", False)
                prop.mortgaged = prop_data.get("mortgaged", False)
        
        # Restore game state
        game_instance.current_player_index = game_data["current_player_index"]
        game_instance.dice_rolled = game_data["dice_rolled"]
        game_instance.last_dice_roll = tuple(game_data["last_dice_roll"])
        
        # Update display
        game_instance.update_display()
        
        messagebox.showinfo("Load Successful", f"Game loaded from {filename}")
        return True
    
    except Exception as e:
        messagebox.showerror("Load Error", f"Failed to load game: {str(e)}")
        return False
