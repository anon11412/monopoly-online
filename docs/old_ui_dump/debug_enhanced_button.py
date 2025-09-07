#!/usr/bin/env python3
"""
ENHANCED TRADE BUTTON DEBUG TEST

This test specifically debugs the Enhanced Trade button issue.
"""

import sys
import os
import tkinter as tk
from tkinter import messagebox

# Add src to path
src_path = os.path.join(os.path.dirname(__file__), 'src')
sys.path.insert(0, src_path)

from src.game import MonopolyGame
from src.player import Player
from src.gui import MonopolyGUI

def debug_button_click():
    print("🔍 Enhanced Trade button clicked!")
    try:
        # Get the current game and GUI
        current_player = game.get_current_player()
        available_partners = [p for p in game.players if p != current_player and not p.bankrupt]
        
        print(f"Current player: {current_player.name}")
        print(f"Available partners: {[p.name for p in available_partners]}")
        
        if not available_partners:
            print("❌ No partners available")
            return
            
        print("✅ Calling gui.open_super_simple_enhanced_dialog()")
        gui.open_super_simple_enhanced_dialog()
        
    except Exception as e:
        print(f"❌ ERROR in button click: {e}")
        import traceback
        traceback.print_exc()

def main():
    global game, gui
    
    print("🔍 ENHANCED TRADE BUTTON DEBUG TEST")
    print("=" * 50)
    
    # Create game with players
    game = MonopolyGame()
    alice = Player("Alice")
    bob = Player("Bob")
    charlie = Player("Charlie")
    
    alice.money = 1500
    bob.money = 1500
    charlie.money = 1500
    
    game.players = [alice, bob, charlie]
    game.current_player_index = 0
    
    # Create GUI
    gui = MonopolyGUI(game)
    game.gui = gui
    root = gui.root
    root.title("🔍 Enhanced Trade Button Debug")
    
    print("✅ Game and GUI initialized")
    print("✅ Current player:", game.get_current_player().name)
    print("✅ Available partners:", [p.name for p in game.players if p != game.get_current_player()])
    
    # Add a debug button to test the functionality
    debug_frame = tk.Frame(root, bg='red')
    debug_frame.pack(pady=10)
    
    debug_btn = tk.Button(debug_frame, text="🔍 DEBUG: Test Enhanced Trade Button", 
                         command=debug_button_click, bg='yellow', font=('Arial', 12, 'bold'))
    debug_btn.pack(pady=5)
    
    print("\n🎯 Click the DEBUG button to test Enhanced Trade functionality")
    print("🎯 Or click the regular '🔄⚡ Super Simple Enhanced Trade' button")
    
    # Start the GUI
    root.mainloop()

if __name__ == "__main__":
    main()
