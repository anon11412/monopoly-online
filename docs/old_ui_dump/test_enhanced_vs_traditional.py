#!/usr/bin/env python3
"""
Test Enhanced Trading vs Traditional Trading
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
    
    # Initialize game
    game = MonopolyGame()
    game.setup_game()
    
    root = tk.Tk()
    root.title("Trading Dialogs Comparison")
    root.geometry("500x400")
    
    # Create test frame
    frame = ttk.Frame(root)
    frame.pack(expand=True, fill='both', padx=20, pady=20)
    
    ttk.Label(frame, text="🔄 Trading System Comparison", 
              font=('Arial', 16, 'bold')).pack(pady=10)
    
    ttk.Label(frame, text="Click buttons to test different trading interfaces:", 
              font=('Arial', 12)).pack(pady=10)
    
    def open_traditional():
        """Open traditional trading dialog"""
        try:
            from trading import open_trading_dialog
            open_trading_dialog(root, game.get_current_player(), game.players, game)
            print("✅ Traditional trading dialog opened")
        except Exception as e:
            print(f"❌ Error opening traditional dialog: {e}")
    
    def open_enhanced():
        """Open enhanced trading dialog"""
        try:
            from enhanced_trading import open_enhanced_trade_dialog
            open_enhanced_trade_dialog(root, game.get_current_player(), game.players, game)
            print("✅ Enhanced trading dialog opened")
        except Exception as e:
            print(f"❌ Error opening enhanced dialog: {e}")
    
    # Traditional button
    traditional_btn = ttk.Button(frame, text="🔄 Traditional Trading\n(Properties + Money only)", 
                                command=open_traditional)
    traditional_btn.pack(pady=10, fill='x')
    
    # Enhanced button  
    enhanced_btn = ttk.Button(frame, text="🔄⚡ Enhanced Trading\n(Properties + Money + Function Blocks)", 
                             command=open_enhanced)
    enhanced_btn.pack(pady=10, fill='x')
    
    # Explanation
    explanation_frame = ttk.LabelFrame(frame, text="What's the difference?")
    explanation_frame.pack(pady=20, fill='both', expand=True)
    
    explanation_text = """
Traditional Trading:
• Partner selection
• Property checkboxes (offer/request)
• Money input fields
• Same as always

Enhanced Trading:
• Everything from Traditional Trading
• PLUS Function Blocks section
• Drag-and-drop 3 blocks: Every Turn, For X Turns, Pay Money
• Inline input fields on blocks (no modals)
• Perfect for "pay $100 per turn for 20 turns" trades
"""
    
    ttk.Label(explanation_frame, text=explanation_text, 
              justify='left', font=('Arial', 10)).pack(padx=10, pady=10)
    
    root.mainloop()

if __name__ == "__main__":
    test_trading_dialogs()
