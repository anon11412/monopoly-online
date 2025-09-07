#!/usr/bin/env python3
"""
Test script to verify the difference between trading dialogs
"""

import tkinter as tk
from tkinter import ttk
import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_trading_dialogs():
    """Test both trading dialogs to see the difference"""
    
    # Create a mock game environment
    from game import MonopolyGame
    from player import Player
    
    # Initialize game
    game = MonopolyGame()
    game.add_player("Test Player 1", "red")
    game.add_player("Test Player 2", "blue")
    
    root = tk.Tk()
    root.title("Trading Dialog Comparison Test")
    root.geometry("400x300")
    
    # Create test frame
    frame = ttk.Frame(root)
    frame.pack(expand=True, fill='both', padx=20, pady=20)
    
    ttk.Label(frame, text="Click buttons to test dialogs:", font=('Arial', 12, 'bold')).pack(pady=10)
    
    def open_traditional():
        """Open traditional trading dialog"""
        try:
            from trading import open_trading_dialog
            open_trading_dialog(root, game.get_current_player(), game.players, game)
            print("✅ Traditional trading dialog opened")
        except Exception as e:
            print(f"❌ Error opening traditional dialog: {e}")
    
    def open_combined():
        """Open combined trading dialog"""
        try:
            from combined_trading import open_combined_trade_dialog
            open_combined_trade_dialog(root, game.get_current_player(), game.players, game)
            print("✅ Combined trading dialog opened")
        except Exception as e:
            print(f"❌ Error opening combined dialog: {e}")
    
    # Traditional button
    ttk.Button(frame, text="🔄 Traditional Trading\n(Original Dialog)", 
               command=open_traditional).pack(pady=10, fill='x')
    
    # Combined button  
    ttk.Button(frame, text="🔄⚡ Enhanced Trading\n(New Combined Dialog with Function Blocks)", 
               command=open_combined).pack(pady=10, fill='x')
    
    ttk.Label(frame, text="The Enhanced dialog should have TABS at the top:\n• Traditional Trading tab\n• Function Blocks tab", 
              justify='center', foreground='darkgreen').pack(pady=20)
    
    root.mainloop()

if __name__ == "__main__":
    test_trading_dialogs()
